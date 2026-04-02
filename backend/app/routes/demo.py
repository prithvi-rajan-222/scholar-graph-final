from __future__ import annotations

from collections.abc import Iterable

from fastapi import APIRouter, HTTPException, Query

from app.config import DEMO_USER_ID, DEMO_USER_NAME
from app.db import get_session
from app.models.graph import (
    DemoBootstrapResponse,
    GeneratedArtifactCatalogItem,
    GeneratedArtifactCatalogResponse,
    GeneratedArtifactHistoryItem,
    GeneratedArtifactHistoryResponse,
    Paper,
    PaperStatusListResponse,
    PaperStatusRequest,
    ProfessorBriefResponse,
    ProfessorSearchResult,
    RecommendationEvidence,
    RecommendationItem,
    RecommendationResponse,
    TopicMasteryResponse,
)
from app.product_db import get_product_session
from app.repositories.graph_repository import GraphRepository
from app.repositories.product_repository import ProductRepository
from app.services.rocketride import rocketride_service

router = APIRouter()

FEATURED_TOPICS = [
    "Transformers",
    "Diffusion models",
    "Retrieval-augmented generation",
]
FUTURE_POTENTIAL_ARTIFACT = "future_potential"
PROFESSOR_BRIEF_ARTIFACT = "professor_brief"
PROFESSOR_ANALYSIS_HEADINGS = {
    "research_summary": "Research Summary",
    "industry_impact": "Industry Impact",
    "build_on_research": "How To Build On Their Research",
    "approach_advice": "How To Approach Them",
}


def _paper_line(paper: Paper) -> str:
    return (
        f"- {paper.title or paper.id} ({paper.year or 'year unknown'}) "
        f"[{paper.citationCount or 0} citations]\n"
        f"  Abstract: {(paper.abstract or 'No abstract available.')[:500]}"
    )


def _fallback_recommendation_reason(
    paper: Paper,
    *,
    shared_read_citation_count: int,
    topic: str | None = None,
    topic_names: Iterable[str] = (),
) -> str:
    topic_hint = next((name for name in topic_names if name), topic or "your current reading path")
    if shared_read_citation_count > 1:
        return (
            f"{paper.title or paper.id} is the strongest next read because it cites {shared_read_citation_count} papers "
            f"you have already read, so it connects multiple parts of your foundation in {topic_hint}."
        )
    if shared_read_citation_count == 1:
        return (
            f"{paper.title or paper.id} is a good next read because it directly builds on a paper you already know, "
            f"making it a natural step forward in {topic_hint}."
        )
    return (
        f"{paper.title or paper.id} is a useful next read because it stays close to {topic_hint} "
        "and appears near the strongest papers in the graph."
    )


def _parse_batched_recommendation_reasons(content: str) -> dict[str, str]:
    reasons: dict[str, str] = {}
    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line or "::" not in line:
            continue
        paper_id, reason = line.split("::", 1)
        paper_id = paper_id.strip()
        reason = reason.strip()
        if paper_id and reason:
            reasons[paper_id] = reason
    return reasons


def _parse_titled_sections(content: str, headings: dict[str, str]) -> dict[str, str]:
    parsed: dict[str, list[str]] = {key: [] for key in headings}
    current_key: str | None = None
    normalized_headings = {title.lower(): key for key, title in headings.items()}

    for raw_line in content.splitlines():
        line = raw_line.strip()
        if line.startswith("## "):
            current_key = normalized_headings.get(line.removeprefix("## ").strip().lower())
            continue
        if current_key is not None:
            parsed[current_key].append(raw_line.rstrip())

    return {
        key: "\n".join(line for line in lines if line.strip()).strip()
        for key, lines in parsed.items()
    }


@router.get("/bootstrap", response_model=DemoBootstrapResponse)
async def bootstrap_demo():
    with get_product_session() as product_session:
        ProductRepository(product_session).ensure_user(DEMO_USER_ID, name=DEMO_USER_NAME)

    featured_professors: list[ProfessorSearchResult] = []
    with get_session() as session:
        featured_professors = GraphRepository(session).search_authors("Andrew", limit=3)
        if not featured_professors:
            featured_professors = GraphRepository(session).search_authors("Yann", limit=3)

    return DemoBootstrapResponse(
        user_id=DEMO_USER_ID,
        provider=rocketride_service.provider_name,
        model=rocketride_service.model,
        configured=rocketride_service.configured,
        featured_topics=FEATURED_TOPICS,
        featured_professors=featured_professors,
    )


@router.get("/artifacts/history", response_model=GeneratedArtifactHistoryResponse)
async def artifact_history(
    artifact_type: str = Query(..., min_length=1),
    subject_type: str = Query(..., min_length=1),
    subject_id: str = Query(..., min_length=1),
    user_id: str = Query(DEMO_USER_ID),
):
    with get_product_session() as product_session:
        product_repo = ProductRepository(product_session)
        product_repo.ensure_user(user_id, name=DEMO_USER_NAME)
        records = product_repo.list_generated_artifacts(
            user_id=user_id,
            artifact_type=artifact_type,
            subject_type=subject_type,
            subject_id=subject_id,
        )

    return GeneratedArtifactHistoryResponse(
        items=[
            GeneratedArtifactHistoryItem(
                id=record.id,
                artifact_type=record.artifact_type,
                subject_type=record.subject_type,
                subject_id=record.subject_id,
                created_at=record.created_at,
                provider=record.provider,
                model=record.model,
            )
            for record in records
        ]
    )


@router.get("/artifacts/catalog", response_model=GeneratedArtifactCatalogResponse)
async def artifact_catalog(
    artifact_type: str = Query(..., min_length=1),
    user_id: str = Query(DEMO_USER_ID),
):
    with get_product_session() as product_session:
        product_repo = ProductRepository(product_session)
        product_repo.ensure_user(user_id, name=DEMO_USER_NAME)
        records = product_repo.list_generated_artifacts_for_user(
            user_id=user_id,
            artifact_type=artifact_type,
        )

    latest_by_subject: dict[tuple[str, str], object] = {}
    for record in records:
        key = (record.subject_type, record.subject_id)
        if key not in latest_by_subject:
            latest_by_subject[key] = record

    items = []
    for record in latest_by_subject.values():
        payload = record.content_json or {}
        title = None
        if artifact_type == "learning_plan":
            title = payload.get("target_title") or record.subject_id
        elif artifact_type == FUTURE_POTENTIAL_ARTIFACT:
            title = payload.get("context") or record.subject_id
        elif artifact_type == PROFESSOR_BRIEF_ARTIFACT:
            professor = payload.get("professor") or {}
            if isinstance(professor, dict):
                title = professor.get("name") or record.subject_id
        items.append(
            GeneratedArtifactCatalogItem(
                id=record.id,
                artifact_type=record.artifact_type,
                subject_type=record.subject_type,
                subject_id=record.subject_id,
                created_at=record.created_at,
                provider=record.provider,
                model=record.model,
                title=title,
            )
        )

    return GeneratedArtifactCatalogResponse(items=items)


@router.get("/topic-mastery", response_model=TopicMasteryResponse)
async def topic_mastery(topic: str = Query(..., min_length=1)):
    with get_session() as session:
        graph_repo = GraphRepository(session)
        anchors = graph_repo.get_topic_anchor_papers(topic)
        if not anchors:
            raise HTTPException(status_code=404, detail=f"No papers found for topic '{topic}'.")

    evidence_ids = [paper.id for paper in anchors]
    prompt = (
        f"You are generating a grounded topic mastery brief for '{topic}'.\n\n"
        "Use only the supplied graph-backed papers.\n"
        "Write with these sections exactly:\n"
        "## What to learn first\n"
        "## Core papers\n"
        "## How the field builds onward\n"
        "## Suggested study sequence\n\n"
        "Evidence papers:\n"
        + "\n".join(
            _paper_line(
                Paper(
                    id=paper.id,
                    title=paper.title,
                    year=paper.year,
                    abstract=paper.abstract,
                    citationCount=paper.citationCount,
                )
            )
            for paper in anchors
        )
    )
    fallback = (
        "## What to learn first\n"
        "Start with the most foundational papers and any explicit prerequisites surfaced by the graph.\n\n"
        "## Core papers\n"
        + "\n".join(f"- {paper.title or paper.id}" for paper in anchors)
        + "\n\n## How the field builds onward\n"
        "Use citation descendants to understand how later work extended the original ideas.\n\n"
        "## Suggested study sequence\n"
        + "\n".join(f"{index + 1}. {paper.title or paper.id}" for index, paper in enumerate(anchors))
    )
    study_plan = await rocketride_service.run_pipeline_text(
        pipeline_name="topic_learning_plan",
        prompt=prompt,
        fallback=fallback,
    )
    return TopicMasteryResponse(
        topic=topic,
        provider=rocketride_service.provider_name,
        model=rocketride_service.model,
        configured=rocketride_service.configured,
        anchors=anchors,
        study_plan=study_plan,
        evidence_ids=evidence_ids,
    )


@router.get("/recommendations", response_model=RecommendationResponse)
async def get_recommendations(
    topic: str | None = Query(None, min_length=1),
    user_id: str = Query(DEMO_USER_ID),
    refresh: bool = Query(False),
    artifact_id: int | None = Query(None),
):
    subject_type = "topic" if topic else "user"
    subject_id = topic or user_id

    with get_product_session() as product_session:
        product_repo = ProductRepository(product_session)
        product_repo.ensure_user(user_id, name=DEMO_USER_NAME)
        latest_read_update = product_repo.get_latest_read_update(user_id)
        if artifact_id is not None:
            record = product_repo.get_generated_artifact_by_id(artifact_id, user_id=user_id)
            if record is None or record.artifact_type != FUTURE_POTENTIAL_ARTIFACT or record.subject_type != subject_type or record.subject_id != subject_id:
                raise HTTPException(status_code=404, detail="Recommendation history entry not found")
            return RecommendationResponse.model_validate(
                {
                    **(record.content_json or {}),
                    "artifact_id": record.id,
                    "created_at": record.created_at,
                }
            )
        record = product_repo.get_latest_generated_artifact(
            user_id=user_id,
            artifact_type=FUTURE_POTENTIAL_ARTIFACT,
            subject_type=subject_type,
            subject_id=subject_id,
        )
        should_reuse_existing = (
            record is not None
            and (
                not refresh
                or latest_read_update is None
                or record.created_at is None
                or latest_read_update <= record.created_at
            )
        )
        if should_reuse_existing:
            return RecommendationResponse.model_validate(
                {
                    **(record.content_json or {}),
                    "artifact_id": record.id,
                    "created_at": record.created_at,
                }
            )

        status_map = product_repo.get_status_map(user_id)
        read_ids = {paper_id for paper_id, status in status_map.items() if status == "read"}

    with get_session() as session:
        graph_repo = GraphRepository(session)
        if topic:
            candidate_papers, evidence_ids = graph_repo.get_topic_recommendation_candidates(
                topic,
                read_ids=read_ids,
                exclude_ids=read_ids,
            )
        else:
            candidate_papers = graph_repo.get_read_history_recommendation_candidates(
                read_ids=read_ids,
                exclude_ids=read_ids,
            )
            evidence_ids = list(read_ids)

    top_candidates = candidate_papers[:5]
    generated_reasons: dict[str, str] = {}

    if top_candidates:
        batch_prompt = "\n\n".join(
            (
                f"Paper ID: {candidate['paper'].id}\n"
                f"Candidate paper: {candidate['paper'].title or candidate['paper'].id}\n"
                f"Candidate abstract: {candidate['paper'].abstract or 'No abstract.'}\n"
                f"Candidate topics: {', '.join(str(name) for name in candidate.get('topic_names', []) if name) or 'Unknown'}\n"
                f"Already-read papers this candidate cites: {int(candidate.get('shared_read_citation_count') or 0)}\n"
                "Supporting read papers:\n"
                + (
                    "\n".join(
                        f"- {support.get('title') or support.get('id')} ({support.get('id')})"
                        for support in candidate.get("supporting_reads", [])[:5]
                        if support.get("id")
                    )
                    or "- None"
                )
            )
            for candidate in top_candidates
        )
        try:
            batched_reason_text = await rocketride_service.run_pipeline_text(
                pipeline_name="reading_recommendation_explainer",
                prompt=(
                    f"Topic: {topic or 'Use the learner read history as the primary context.'}\n"
                    f"Topic anchor evidence IDs: {', '.join(evidence_ids) or 'none'}\n\n"
                    "For each candidate below, write one short reason for why it should be next.\n"
                    "Return exactly one line per candidate in this format:\n"
                    "PAPER_ID:: reason text\n\n"
                    "Prioritize the fact that the paper cites already-read papers, and explicitly reward candidates that cite multiple already-read papers.\n\n"
                    f"{batch_prompt}"
                ),
                fallback="\n".join(
                    f"{candidate['paper'].id}:: "
                    + _fallback_recommendation_reason(
                        candidate["paper"],
                        shared_read_citation_count=int(candidate.get("shared_read_citation_count") or 0),
                        topic=topic,
                        topic_names=candidate.get("topic_names", []),
                    )
                    for candidate in top_candidates
                ),
            )
            generated_reasons = _parse_batched_recommendation_reasons(batched_reason_text)
        except RuntimeError as exc:
            if "Pipeline is already running" not in str(exc):
                raise

    items: list[RecommendationItem] = []
    for candidate in top_candidates:
        paper = candidate["paper"]
        supporting_reads = candidate.get("supporting_reads", [])
        shared_read_citation_count = int(candidate.get("shared_read_citation_count") or 0)
        topic_names = [str(name) for name in candidate.get("topic_names", []) if name][:5]
        reason = generated_reasons.get(paper.id) or _fallback_recommendation_reason(
            paper,
            shared_read_citation_count=shared_read_citation_count,
            topic=topic,
            topic_names=topic_names,
        )
        items.append(
            RecommendationItem(
                paper=paper,
                reason=reason,
                reason_code="cites_read_papers" if shared_read_citation_count > 0 else "graph_next_read",
                evidence=(
                    [
                        RecommendationEvidence(
                            paper_id=str(support["id"]),
                            relation="cites_read_paper",
                            note=support.get("title"),
                        )
                        for support in supporting_reads[:4]
                        if support.get("id")
                    ]
                    if shared_read_citation_count > 0
                    else [RecommendationEvidence(paper_id=evidence_id, relation="topic_anchor") for evidence_id in evidence_ids[:3]]
                ),
            )
        )

    with get_product_session() as product_session:
        product_repo = ProductRepository(product_session)
        product_repo.log_recommendations(
            user_id=user_id,
            context_type=subject_type,
            context_value=subject_id,
            recommendations=items,
        )
        artifact = product_repo.store_generated_artifact(
            user_id=user_id,
            artifact_type=FUTURE_POTENTIAL_ARTIFACT,
            subject_type=subject_type,
            subject_id=subject_id,
            provider=rocketride_service.provider_name,
            model=rocketride_service.model,
            content_json={
                "user_id": user_id,
                "context": topic or "Read history",
                "provider": rocketride_service.provider_name,
                "model": rocketride_service.model,
                "items": [item.model_dump(mode="json") for item in items],
            },
        )

    return RecommendationResponse(
        artifact_id=artifact.id,
        created_at=artifact.created_at,
        user_id=user_id,
        context=topic or "Read history",
        provider=rocketride_service.provider_name,
        model=rocketride_service.model,
        items=items,
    )


@router.get("/professors/search", response_model=list[ProfessorSearchResult])
async def search_professors(q: str = Query(..., min_length=1)):
    with get_session() as session:
        return GraphRepository(session).search_authors(q)


@router.get("/professors/{author_id}/brief", response_model=ProfessorBriefResponse)
async def professor_brief(
    author_id: str,
    user_id: str = Query(DEMO_USER_ID),
    refresh: bool = Query(False),
    artifact_id: int | None = Query(None),
):
    with get_product_session() as product_session:
        product_repo = ProductRepository(product_session)
        product_repo.ensure_user(user_id, name=DEMO_USER_NAME)
        if artifact_id is not None:
            record = product_repo.get_generated_artifact_by_id(artifact_id, user_id=user_id)
            if record is None or record.artifact_type != PROFESSOR_BRIEF_ARTIFACT or record.subject_type != "author" or record.subject_id != author_id:
                raise HTTPException(status_code=404, detail="Professor history entry not found")
            return ProfessorBriefResponse.model_validate(
                {
                    **(record.content_json or {}),
                    "artifact_id": record.id,
                    "created_at": record.created_at,
                }
            )
        if not refresh:
            record = product_repo.get_latest_generated_artifact(
                user_id=user_id,
                artifact_type=PROFESSOR_BRIEF_ARTIFACT,
                subject_type="author",
                subject_id=author_id,
            )
            if record is not None:
                return ProfessorBriefResponse.model_validate(
                    {
                        **(record.content_json or {}),
                        "artifact_id": record.id,
                        "created_at": record.created_at,
                    }
                )

    with get_session() as session:
        context = GraphRepository(session).get_author_detail(author_id)

    evidence_ids = [paper.id for paper in context.top_papers[:6]]
    prompt = (
        f"Professor: {context.professor.name}\n"
        f"Institution: {context.professor.institution or 'Unknown'}\n"
        f"Topics: {', '.join(context.topic_names) or 'None listed'}\n"
        f"Authored paper count: {context.authored_paper_count}\n"
        f"Referenced paper count: {context.referenced_paper_count}\n"
        f"Citing paper count: {context.citing_paper_count}\n"
        "Top papers:\n"
        + "\n".join(_paper_line(paper) for paper in context.top_papers[:6])
        + "\n\nReferenced papers:\n"
        + "\n".join(_paper_line(paper) for paper in context.referenced_papers[:5])
        + "\n\nDescendant papers:\n"
        + "\n".join(_paper_line(paper) for paper in context.descendant_papers[:4])
        + "\n\nWrite these sections exactly, with markdown headings:\n"
        "## Research Summary\n"
        "## Industry Impact\n"
        "## How To Build On Their Research\n"
        "## How To Approach Them\n\n"
        "Ground everything in the supplied graph evidence only. "
        "Do not invent biography, affiliation history, or claims outside the prompt."
    )
    fallback_analysis = (
        "## Research Summary\n"
        f"{context.professor.name} works across {', '.join(context.topic_names[:4]) or 'connected research areas'}. "
        "The authored-paper timeline suggests a coherent research arc with repeated themes and highly cited anchor papers.\n\n"
        "## Industry Impact\n"
        "The citation neighborhood suggests this work shaped later research directions by providing ideas that descendant papers continued to build on.\n\n"
        "## How To Build On Their Research\n"
        "Start from the highest-citation authored papers, inspect the referenced foundations, then identify open questions in the descendant papers where methods, data, or evaluation could be improved.\n\n"
        "## How To Approach Them\n"
        "Approach with a concrete reading-backed point of view: mention one authored paper, one paper they build on, and one downstream paper you want to extend."
    )
    analysis_text = await rocketride_service.run_pipeline_text(
        pipeline_name="professor_research_brief",
        prompt=prompt,
        fallback=fallback_analysis,
    )
    parsed_sections = _parse_titled_sections(analysis_text, PROFESSOR_ANALYSIS_HEADINGS)

    research_brief = parsed_sections.get("research_summary") or (
        f"{context.professor.name} works across {', '.join(context.topic_names[:4]) or 'connected research areas'}, "
        "and the surrounding citation graph suggests a research arc with meaningful downstream influence."
    )
    industry_impact = parsed_sections.get("industry_impact") or (
        "The citation neighborhood suggests this work influenced later papers in adjacent research areas."
    )
    build_on_research = parsed_sections.get("build_on_research") or (
        "Begin with the professor's anchor papers, then use cited foundations and citing descendants to find the clearest extension points."
    )
    approach_advice = parsed_sections.get("approach_advice") or (
        "Lead with a specific paper-backed idea and show that you understand both the foundations they cited and the later work that built on them."
    )

    future_directions = await rocketride_service.run_pipeline_text(
        pipeline_name="future_research_directions",
        prompt=(
            f"Professor: {context.professor.name}\n"
            f"Topics: {', '.join(context.topic_names) or 'None listed'}\n"
            "Top papers:\n"
            + "\n".join(_paper_line(paper) for paper in context.top_papers[:6])
            + "\n\nGenerate exactly 3 grounded future research directions, one per line, using only this evidence."
        ),
        fallback="\n".join([
            f"Extend {context.professor.name}'s strongest themes into a neighboring subfield surfaced by the graph.",
            "Identify a recent descendant paper cluster and propose a more data-efficient or interpretable variant.",
            "Pitch a project that connects the professor's established line of work to a growing adjacent topic.",
        ]),
    )

    response = ProfessorBriefResponse(
        professor=context.professor,
        provider=rocketride_service.provider_name,
        model=rocketride_service.model,
        configured=rocketride_service.configured,
        research_brief=research_brief.strip(),
        industry_impact=industry_impact.strip(),
        build_on_research=build_on_research.strip(),
        approach_advice=approach_advice.strip(),
        future_directions=[
            line.strip("- ").strip()
            for line in future_directions.splitlines()
            if line.strip()
        ][:3],
        evidence_ids=evidence_ids,
        top_papers=context.top_papers,
        timeline=context.timeline,
        topic_names=context.topic_names,
        collaborators=context.collaborators,
        descendant_papers=context.descendant_papers,
        referenced_papers=context.referenced_papers,
        authored_paper_count=context.authored_paper_count,
        referenced_paper_count=context.referenced_paper_count,
        citing_paper_count=context.citing_paper_count,
    )

    with get_product_session() as product_session:
        product_repo = ProductRepository(product_session)
        artifact = product_repo.store_generated_artifact(
            user_id=user_id,
            artifact_type=PROFESSOR_BRIEF_ARTIFACT,
            subject_type="author",
            subject_id=author_id,
            provider=response.provider,
            model=response.model,
            content_json=response.model_dump(mode="json", exclude={"artifact_id", "created_at"}),
        )

    return response.model_copy(update={"artifact_id": artifact.id, "created_at": artifact.created_at})


@router.get("/paper-status", response_model=PaperStatusListResponse)
async def get_paper_statuses(user_id: str = Query(DEMO_USER_ID)):
    with get_product_session() as product_session:
        product_repo = ProductRepository(product_session)
        product_repo.ensure_user(user_id, name=DEMO_USER_NAME)
        status_map = product_repo.get_status_map(user_id)
    return PaperStatusListResponse(
        user_id=user_id,
        statuses=[{"paper_id": paper_id, "status": status} for paper_id, status in sorted(status_map.items())],
    )


@router.post("/paper-status", response_model=PaperStatusListResponse)
async def set_paper_status(body: PaperStatusRequest):
    user_id = body.user_id or DEMO_USER_ID
    with get_product_session() as product_session:
        product_repo = ProductRepository(product_session)
        product_repo.ensure_user(user_id, name=DEMO_USER_NAME)
        product_repo.set_paper_status(user_id, body.paper_id, body.status, note=body.note)
        status_map = product_repo.get_status_map(user_id)
    return PaperStatusListResponse(
        user_id=user_id,
        statuses=[{"paper_id": paper_id, "status": status} for paper_id, status in sorted(status_map.items())],
    )
