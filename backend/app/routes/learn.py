"""
Learning endpoints for graph-grounded study plans and in-app lessons.

This route now returns both:
  - a high-level reading plan for the ordered papers
  - a sequential curriculum with one grounded lesson per paper

It also exposes a follow-up Q&A endpoint so the frontend can ask questions
about the current lesson without leaving the app.
"""

from __future__ import annotations

import re

from fastapi import APIRouter, HTTPException, Query

from app.config import DEMO_USER_ID, DEMO_USER_NAME
from app.db import get_session
from app.models.graph import (
    GeneratedArtifactHistoryItem,
    GeneratedArtifactHistoryResponse,
    LearnPlanResponse,
    LearnQuestionRequest,
    LearnQuestionResponse,
    LessonSection,
    PaperInPlan,
    PaperLesson,
)
from app.product_db import get_product_session
from app.repositories.product_repository import ProductRepository
from app.services.rocketride import rocketride_service

router = APIRouter()
LEARNING_PLAN_ARTIFACT = "learning_plan"


def _truncate(text: str | None, chars: int = 900) -> str:
    if not text:
        return ""
    return text[:chars].rstrip() + ("…" if len(text) > chars else "")


def _format_paper_block(paper: PaperInPlan) -> str:
    year = f" ({paper.year})" if paper.year else ""
    cites = f", {paper.citationCount:,} citations" if paper.citationCount else ""
    role_label = {
        "target": "TARGET",
        "prerequisite": f"PREREQUISITE (depth {paper.depth})",
        "builds_on": "FOLLOW-UP / BUILDS ON",
        "topic_anchor": "TOPIC ANCHOR",
    }.get(paper.role, paper.role.upper())

    abstract = _truncate(paper.abstract)
    abstract_line = f"\nAbstract: {abstract}" if abstract else "\nAbstract: Not available."

    return (
        f"Title: {paper.title or paper.id}\n"
        f"Paper ID: {paper.id}\n"
        f"Role: {role_label}{year}{cites}"
        f"{abstract_line}"
    )


async def _call_rocketride(*, pipeline_name: str, prompt: str, fallback: str | None = None) -> str:
    return await rocketride_service.run_pipeline_text(
        pipeline_name=pipeline_name,
        prompt=prompt,
        fallback=fallback,
    )


def _coerce_lesson(paper: PaperInPlan, payload: dict) -> PaperLesson:
    sections = payload.get("lesson_sections") or []
    key_concepts = [str(item).strip() for item in payload.get("key_concepts", []) if str(item).strip()]

    return PaperLesson(
        paper_id=paper.id,
        lesson_title=str(payload.get("lesson_title") or f"Learning {paper.title or paper.id}").strip(),
        overview=str(payload.get("overview") or "").strip(),
        connection_to_previous=str(payload.get("connection_to_previous") or "").strip() or None,
        why_now=str(payload.get("why_now") or "").strip(),
        key_concepts=key_concepts[:5],
        lesson_sections=[
            LessonSection(
                heading=str(section.get("heading") or "Lesson").strip(),
                content=str(section.get("content") or "").strip(),
            )
            for section in sections
            if isinstance(section, dict) and str(section.get("content") or "").strip()
        ][:4],
        check_for_understanding=str(payload.get("check_for_understanding") or "").strip(),
        knowledge_state_after=str(payload.get("knowledge_state_after") or "").strip(),
        grounded_in=str(payload.get("grounded_in") or "Abstract and paper metadata.").strip(),
    )


def _parse_lesson_text(content: str) -> dict:
    sections: dict[str, list[str]] = {"overview": []}
    current_key = "overview"

    expected_labels = {
        "lesson title",
        "overview",
        "connection to previous",
        "why now",
        "key concepts",
        "section 1",
        "section 2",
        "section 3",
        "check for understanding",
        "knowledge state after",
        "grounded in",
    }

    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        if ":" in line:
            maybe_key, maybe_value = line.split(":", 1)
            normalized_key = maybe_key.strip().lower()
            if normalized_key in expected_labels:
                current_key = normalized_key
                sections.setdefault(current_key, [])
                if maybe_value.strip():
                    sections[current_key].append(maybe_value.strip())
                continue

        normalized = line.lower().rstrip(":")
        if normalized in expected_labels:
            current_key = normalized
            sections.setdefault(current_key, [])
            continue

        sections.setdefault(current_key, []).append(line)

    def joined(key: str, fallback: str = "") -> str:
        return " ".join(sections.get(key, [])).strip() or fallback

    key_concepts = []
    for item in sections.get("key concepts", []):
        key_concepts.extend([part.strip(" -") for part in item.split(",") if part.strip(" -")])

    lesson_sections = []
    for index, heading in enumerate(
        ["What problem is this paper solving?", "Core idea", "What changed because of this paper?"],
        start=1,
    ):
        value = joined(f"section {index}")
        if value:
            lesson_sections.append({"heading": heading, "content": value})

    return {
        "lesson_title": joined("lesson title"),
        "overview": joined("overview"),
        "connection_to_previous": joined("connection to previous"),
        "why_now": joined("why now"),
        "key_concepts": key_concepts,
        "lesson_sections": lesson_sections,
        "check_for_understanding": joined("check for understanding"),
        "knowledge_state_after": joined("knowledge state after"),
        "grounded_in": joined("grounded in"),
    }


async def _generate_learning_plan_text(target: str, papers: list[PaperInPlan]) -> str:
    paper_blocks = "\n\n".join(_format_paper_block(p) for p in papers)

    user_message = f"""A student wants to master: "{target}"

Here are {len(papers)} papers from the citation graph, already ordered by the app:

{paper_blocks}

Create a structured reading plan with these sections:

## 1. Background Prerequisites
## 2. Reading Order & Rationale
## 3. Key Concepts by Stage
## 4. Estimated Time
## 5. One-Sentence Summary

For the reading order section, mention every paper by exact title and explain why it comes at this point.
Ground all claims in the paper metadata and abstract text provided here."""

    fallback = (
        "## 1. Background Prerequisites\n"
        "Start with the listed prerequisite papers first, then move into the target papers.\n\n"
        "## 2. Reading Order & Rationale\n"
        + "\n".join(f"- {paper.title or paper.id}: included for its role as {paper.role}." for paper in papers)
        + "\n\n## 3. Key Concepts by Stage\n"
        "Use the prerequisites to build context, the anchors/target to learn the core idea, and the follow-ups to see downstream impact.\n\n"
        "## 4. Estimated Time\n"
        f"Plan for {max(len(papers), 1)} focused study sessions.\n\n"
        "## 5. One-Sentence Summary\n"
        f"This RocketRide-backed study path helps a learner build toward {target} using evidence from the graph."
    )
    return await _call_rocketride(
        pipeline_name="topic_learning_plan",
        prompt=user_message,
        fallback=fallback,
    )


async def _generate_curriculum(target: str, papers: list[PaperInPlan]) -> list[PaperLesson]:
    curriculum: list[PaperLesson] = []
    running_memory = (
        f"The student is starting a learning path for '{target}'. "
        "No prior lessons from this path have been taught yet."
    )
    previous_title: str | None = None

    for index, paper in enumerate(papers, start=1):
        lesson_prompt = f"""You are generating lesson {index} of {len(papers)} in a graph-ordered curriculum.

Target topic/paper: {target}

Current paper:
{_format_paper_block(paper)}

Previous paper title: {previous_title or "None"}

What the student has learned so far:
{running_memory}

Return plain text with exactly these labels:
Lesson Title:
Overview:
Connection to Previous:
Why Now:
Key Concepts:
Section 1:
Section 2:
Section 3:
Check for Understanding:
Knowledge State After:
Grounded In:

Rules:
- Use only the supplied abstract and metadata. Do not invent experiments, equations, or claims not supported here.
- Write like a teacher building on earlier lessons.
- If the abstract is sparse, say that explicitly and stay high level.
- Make the connection to previous paper concrete when possible.
- Keep the output tight and demo-friendly."""

        lesson_text = await _call_rocketride(
            pipeline_name="topic_learning_plan",
            prompt=lesson_prompt,
            fallback=(
                f"Lesson Title: Understand {paper.title or paper.id}\n"
                f"Overview: This lesson situates {paper.title or paper.id} within the learning path using the paper metadata and abstract.\n"
                f"Connection to Previous: {'' if index == 1 else f'This paper builds on the prior lesson by extending the path toward {target}.'}\n"
                "Why Now: It appears at this point because the graph suggests it is either prerequisite context, a target paper, or a meaningful follow-up.\n"
                "Key Concepts: graph context, citation role, topic evolution\n"
                f"Section 1: {_truncate(paper.abstract, chars=240) or 'Use the abstract and title to discuss the problem framing.'}\n"
                "Section 2: Focus on the core contribution described in the title, abstract, and graph position.\n"
                "Section 3: Use the citation graph to explain how later work or adjacent papers build from it.\n"
                f"Check for Understanding: What role does {paper.title or paper.id} play in the broader path toward {target}?\n"
                f"Knowledge State After: After this lesson, the learner should understand why {paper.title or paper.id} matters within the graph-backed sequence.\n"
                "Grounded In: Paper abstract, metadata, and graph role."
            ),
        )
        payload = _parse_lesson_text(lesson_text)

        lesson = _coerce_lesson(paper, payload)
        curriculum.append(lesson)
        running_memory = lesson.knowledge_state_after
        previous_title = paper.title or paper.id

    return curriculum


def _build_paper_learning_response(
    target_title: str,
    papers: list[PaperInPlan],
    plan: str,
    curriculum: list[PaperLesson],
    *,
    artifact_id: int | None = None,
    created_at=None,
) -> LearnPlanResponse:
    return LearnPlanResponse(
        artifact_id=artifact_id,
        created_at=created_at,
        target_title=target_title,
        papers=papers,
        plan=plan,
        curriculum=curriculum,
        total_papers=len(papers),
        provider=rocketride_service.provider_name,
        model=rocketride_service.model,
        evidence_ids=[paper.id for paper in papers],
    )


def _artifact_to_learn_response(record) -> LearnPlanResponse:
    payload = record.content_json or {}
    return LearnPlanResponse.model_validate(
        {
            **payload,
            "artifact_id": record.id,
            "created_at": record.created_at,
        }
    )


def _learn_response_to_json(response: LearnPlanResponse) -> dict:
    return response.model_dump(mode="json", exclude={"artifact_id", "created_at"})


@router.get("/history", response_model=GeneratedArtifactHistoryResponse)
async def learn_history(
    subject_type: str = Query(..., pattern="^(paper|topic)$"),
    subject_id: str = Query(..., min_length=1),
    user_id: str = Query(DEMO_USER_ID),
):
    with get_product_session() as product_session:
        product_repo = ProductRepository(product_session)
        product_repo.ensure_user(user_id, name=DEMO_USER_NAME)
        records = product_repo.list_generated_artifacts(
            user_id=user_id,
            artifact_type=LEARNING_PLAN_ARTIFACT,
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


@router.post("/question", response_model=LearnQuestionResponse)
async def ask_learn_question(body: LearnQuestionRequest):
    question = body.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question must not be empty.")

    prompt = f"""A learner is studying a graph-grounded paper curriculum.

Target: {body.target_title}

Current paper:
{_format_paper_block(body.paper)}

Current lesson:
Title: {body.lesson.lesson_title}
Overview: {body.lesson.overview}
Connection to previous: {body.lesson.connection_to_previous or "None"}
Why now: {body.lesson.why_now}
Key concepts: {", ".join(body.lesson.key_concepts)}
Knowledge state after: {body.lesson.knowledge_state_after}
Grounded in: {body.lesson.grounded_in}

What the learner has already covered in prior papers:
{body.learned_context or "No prior lesson context provided."}

Learner question:
{question}

Answer using only the supplied paper details and lesson context. If the question asks for something not supported by the supplied abstract or lesson, say that clearly and answer at the highest-confidence level possible."""

    answer = await _call_rocketride(
        pipeline_name="paper_summary",
        prompt=prompt,
        fallback=(
            "RocketRide is not configured, so this answer is using a local fallback. "
            "Based on the supplied lesson and graph context, focus on the paper's role, title, abstract, and "
            "how it connects to the surrounding papers in the sequence."
        ),
    )

    return LearnQuestionResponse(answer=answer.strip())


@router.get("/paper/{paper_id}", response_model=LearnPlanResponse)
async def learn_paper(
    paper_id: str,
    user_id: str = Query(DEMO_USER_ID),
    refresh: bool = Query(False),
    artifact_id: int | None = Query(None),
):
    with get_product_session() as product_session:
        product_repo = ProductRepository(product_session)
        product_repo.ensure_user(user_id, name=DEMO_USER_NAME)
        if artifact_id is not None:
            record = product_repo.get_generated_artifact_by_id(artifact_id, user_id=user_id)
            if record is None or record.artifact_type != LEARNING_PLAN_ARTIFACT or record.subject_type != "paper" or record.subject_id != paper_id:
                raise HTTPException(status_code=404, detail="Learning plan history entry not found")
            return _artifact_to_learn_response(record)
        if not refresh:
            record = product_repo.get_latest_generated_artifact(
                user_id=user_id,
                artifact_type=LEARNING_PLAN_ARTIFACT,
                subject_type="paper",
                subject_id=paper_id,
            )
            if record is not None:
                return _artifact_to_learn_response(record)

    with get_session() as session:
        target_rec = session.run(
            """
            MATCH (p:Paper {id: $id})
            RETURN p.id AS id, p.title AS title, p.year AS year,
                   p.citationCount AS citationCount, p.abstract AS abstract
            """,
            id=paper_id,
        ).single()
        if target_rec is None:
            raise HTTPException(status_code=404, detail="Paper not found")

        prereq_recs = session.run(
            """
            MATCH path = (prereq:Paper)-[:REQUIRES_UNDERSTANDING*1..2]->(target:Paper {id: $id})
            WITH prereq, min(length(path)) AS depth
            RETURN prereq.id AS id, prereq.title AS title, prereq.year AS year,
                   prereq.citationCount AS citationCount, prereq.abstract AS abstract,
                   depth
            ORDER BY depth DESC, prereq.citationCount DESC
            LIMIT 8
            """,
            id=paper_id,
        ).data()

        builds_recs = session.run(
            """
            MATCH (other:Paper)-[:CITES]->(target:Paper {id: $id})
            WHERE other.citationCount IS NOT NULL AND other.id <> $id
            RETURN other.id AS id, other.title AS title, other.year AS year,
                   other.citationCount AS citationCount, other.abstract AS abstract
            ORDER BY other.citationCount DESC
            LIMIT 5
            """,
            id=paper_id,
        ).data()

    target_data = target_rec.data()
    papers: list[PaperInPlan] = []

    for record in prereq_recs:
        papers.append(
            PaperInPlan(
                id=record["id"],
                title=record["title"],
                year=record["year"],
                citationCount=record["citationCount"],
                abstract=record["abstract"],
                role="prerequisite",
                depth=record["depth"],
            )
        )

    papers.append(
        PaperInPlan(
            id=target_data["id"],
            title=target_data["title"],
            year=target_data["year"],
            citationCount=target_data["citationCount"],
            abstract=target_data["abstract"],
            role="target",
        )
    )

    seen = {paper.id for paper in papers}
    for record in builds_recs:
        if record["id"] in seen:
            continue
        papers.append(
            PaperInPlan(
                id=record["id"],
                title=record["title"],
                year=record["year"],
                citationCount=record["citationCount"],
                abstract=record["abstract"],
                role="builds_on",
            )
        )
        seen.add(record["id"])

    target_title = target_data["title"] or paper_id
    plan = await _generate_learning_plan_text(target_title, papers)
    curriculum = await _generate_curriculum(target_title, papers)
    response = _build_paper_learning_response(target_title, papers, plan, curriculum)
    with get_product_session() as product_session:
        product_repo = ProductRepository(product_session)
        record = product_repo.store_generated_artifact(
            user_id=user_id,
            artifact_type=LEARNING_PLAN_ARTIFACT,
            subject_type="paper",
            subject_id=paper_id,
            provider=response.provider or rocketride_service.provider_name,
            model=response.model or rocketride_service.model,
            content_json=_learn_response_to_json(response),
        )
    return response.model_copy(update={"artifact_id": record.id, "created_at": record.created_at})


@router.get("/topic", response_model=LearnPlanResponse)
async def learn_topic(
    topic: str = Query(..., description="Free-text topic, e.g. 'transformer attention mechanism'"),
    user_id: str = Query(DEMO_USER_ID),
    refresh: bool = Query(False),
    artifact_id: int | None = Query(None),
):
    topic = topic.strip()
    if not topic:
        raise HTTPException(status_code=400, detail="Topic must not be empty.")

    with get_product_session() as product_session:
        product_repo = ProductRepository(product_session)
        product_repo.ensure_user(user_id, name=DEMO_USER_NAME)
        if artifact_id is not None:
            record = product_repo.get_generated_artifact_by_id(artifact_id, user_id=user_id)
            if record is None or record.artifact_type != LEARNING_PLAN_ARTIFACT or record.subject_type != "topic" or record.subject_id != topic:
                raise HTTPException(status_code=404, detail="Learning plan history entry not found")
            return _artifact_to_learn_response(record)
        if not refresh:
            record = product_repo.get_latest_generated_artifact(
                user_id=user_id,
                artifact_type=LEARNING_PLAN_ARTIFACT,
                subject_type="topic",
                subject_id=topic,
            )
            if record is not None:
                return _artifact_to_learn_response(record)

    topic_lc = topic.lower()

    with get_session() as session:
        anchor_recs = session.run(
            """
            MATCH (p:Paper)
            OPTIONAL MATCH (p)-[:COVERS]->(t:Topic)
            WITH p, collect(DISTINCT t.name) AS topic_names
            WITH
                p,
                topic_names,
                [
                    name IN topic_names
                    WHERE name IS NOT NULL
                      AND (toLower(name) CONTAINS $topic_lc OR $topic_lc CONTAINS toLower(name))
                ] AS matched_topics,
                CASE WHEN toLower(coalesce(p.title, "")) CONTAINS $topic_lc THEN 2 ELSE 0 END AS title_score,
                CASE WHEN toLower(coalesce(p.abstract, "")) CONTAINS $topic_lc THEN 1 ELSE 0 END AS abstract_score
            WITH
                p,
                matched_topics,
                size(matched_topics) * 3 + title_score + abstract_score AS relevance
            WHERE relevance > 0
            RETURN DISTINCT p.id AS id, p.title AS title, p.year AS year,
                   p.citationCount AS citationCount, p.abstract AS abstract,
                   CASE
                     WHEN size(matched_topics) > 0 THEN matched_topics[0]
                     ELSE null
                   END AS matched_topic,
                   relevance
            ORDER BY p.citationCount DESC
            LIMIT 5
            """,
            topic=topic,
            topic_lc=topic_lc,
        ).data()

        if not anchor_recs:
            raise HTTPException(
                status_code=404,
                detail=f"No papers found for topic '{topic}'. Try a broader term.",
            )

        anchor_ids = [record["id"] for record in anchor_recs]

        prereq_recs = session.run(
            """
            UNWIND $ids AS anchor_id
            MATCH path = (prereq:Paper)-[:REQUIRES_UNDERSTANDING*1..2]->(target:Paper {id: anchor_id})
            WHERE NOT prereq.id IN $ids
            WITH prereq, min(length(path)) AS depth
            RETURN prereq.id AS id, prereq.title AS title, prereq.year AS year,
                   prereq.citationCount AS citationCount, prereq.abstract AS abstract,
                   depth
            ORDER BY depth DESC, prereq.citationCount DESC
            LIMIT 8
            """,
            ids=anchor_ids,
        ).data()

        extra_recs = session.run(
            """
            UNWIND $ids AS anchor_id
            MATCH (anchor:Paper {id: anchor_id})-[:COVERS]->(shared_topic:Topic)<-[:COVERS]-(p:Paper)
            WHERE NOT p.id IN $ids
            WITH p, count(DISTINCT shared_topic) AS shared_topics
            ORDER BY shared_topics DESC, p.citationCount DESC
            LIMIT 50
            OPTIONAL MATCH (p)-[:CITES]->(cited:Paper)
            WHERE cited.id IN $ids
            RETURN DISTINCT p.id AS id, p.title AS title, p.year AS year,
                   p.citationCount AS citationCount, p.abstract AS abstract,
                   shared_topics,
                   count(DISTINCT cited) AS cites_anchor_count
            ORDER BY shared_topics DESC, cites_anchor_count DESC, p.citationCount DESC
            LIMIT 4
            """,
            ids=anchor_ids,
        ).data()

    papers: list[PaperInPlan] = []
    seen: set[str] = set()

    for record in prereq_recs:
        if record["id"] in seen:
            continue
        papers.append(
            PaperInPlan(
                id=record["id"],
                title=record["title"],
                year=record["year"],
                citationCount=record["citationCount"],
                abstract=record["abstract"],
                role="prerequisite",
                depth=record["depth"],
            )
        )
        seen.add(record["id"])

    for record in anchor_recs:
        if record["id"] in seen:
            continue
        papers.append(
            PaperInPlan(
                id=record["id"],
                title=record["title"],
                year=record["year"],
                citationCount=record["citationCount"],
                abstract=record["abstract"],
                role="topic_anchor",
            )
        )
        seen.add(record["id"])

    for record in extra_recs:
        if record["id"] in seen:
            continue
        papers.append(
            PaperInPlan(
                id=record["id"],
                title=record["title"],
                year=record["year"],
                citationCount=record["citationCount"],
                abstract=record["abstract"],
                role="builds_on",
            )
        )
        seen.add(record["id"])

    plan = await _generate_learning_plan_text(topic, papers)
    curriculum = await _generate_curriculum(topic, papers)
    response = _build_paper_learning_response(topic, papers, plan, curriculum)
    with get_product_session() as product_session:
        product_repo = ProductRepository(product_session)
        record = product_repo.store_generated_artifact(
            user_id=user_id,
            artifact_type=LEARNING_PLAN_ARTIFACT,
            subject_type="topic",
            subject_id=topic,
            provider=response.provider or rocketride_service.provider_name,
            model=response.model or rocketride_service.model,
            content_json=_learn_response_to_json(response),
        )
    return response.model_copy(update={"artifact_id": record.id, "created_at": record.created_at})
