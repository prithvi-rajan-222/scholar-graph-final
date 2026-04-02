from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.db import get_session
from app.models.graph import ExplainPathRequest, FieldTrajectoryRequest, SummarizePaperRequest
from app.repositories.graph_repository import GraphRepository
from app.services.rocketride import rocketride_service

router = APIRouter()


@router.post("/explain-path")
async def explain_path(body: ExplainPathRequest):
    with get_session() as session:
        graph_repo = GraphRepository(session)
        papers = [graph_repo.get_paper_by_id(paper_id) for paper_id in body.paper_ids]

    prompt = (
        "Explain this research reading path in plain English, staying grounded in the supplied papers only.\n\n"
        + "\n".join(
            f"- {paper.title or paper.id} ({paper.year or 'year unknown'}): {(paper.abstract or 'No abstract.')[:500]}"
            for paper in papers
        )
    )
    explanation = await rocketride_service.run_pipeline_text(
        pipeline_name="topic_learning_plan",
        prompt=prompt,
        fallback="This path starts with foundational context, then moves into the core paper, and finally follows the work that builds on it.",
    )
    return {
        "provider": rocketride_service.provider_name,
        "model": rocketride_service.model,
        "paper_ids": body.paper_ids,
        "explanation": explanation,
    }


@router.post("/summarize-paper")
async def summarize_paper(body: SummarizePaperRequest):
    with get_session() as session:
        paper = GraphRepository(session).get_paper_summary_context(body.paper_id)

    prompt = (
        f"Summarize this paper for a student in 4 to 6 sentences.\n"
        f"Title: {paper.get('title') or paper.get('id')}\n"
        f"Year: {paper.get('year')}\n"
        f"Citations: {paper.get('citationCount')}\n"
        f"Authors: {', '.join(paper.get('authors', []))}\n"
        f"Topics: {', '.join(paper.get('topics', []))}\n"
        f"Abstract: {paper.get('abstract') or 'No abstract available.'}\n"
        "Stay grounded in the provided evidence only."
    )
    summary = await rocketride_service.run_pipeline_text(
        pipeline_name="paper_summary",
        prompt=prompt,
        fallback="This paper should be understood through its title, abstract, authors, and topic labels; the available metadata suggests it is an important part of the surrounding research graph.",
    )
    return {
        "provider": rocketride_service.provider_name,
        "model": rocketride_service.model,
        "paper_id": body.paper_id,
        "summary": summary,
        "evidence_ids": [body.paper_id],
    }


@router.post("/field-trajectory")
async def field_trajectory(body: FieldTrajectoryRequest):
    with get_session() as session:
        anchors = GraphRepository(session).get_topic_anchor_papers(body.topic, limit=8)
    if not anchors:
        raise HTTPException(status_code=404, detail=f"No papers found for topic '{body.topic}'.")

    prompt = (
        f"Describe how the field '{body.topic}' evolves over time using only these papers:\n\n"
        + "\n".join(
            f"- {paper.title or paper.id} ({paper.year or 'year unknown'}): {(paper.abstract or 'No abstract.')[:450]}"
            for paper in anchors
        )
    )
    trajectory = await rocketride_service.run_pipeline_text(
        pipeline_name="topic_learning_plan",
        prompt=prompt,
        fallback=f"The field trajectory for {body.topic} can be explained by starting with the earliest foundational papers and then following the later, more highly cited papers that build on them.",
    )
    return {
        "provider": rocketride_service.provider_name,
        "model": rocketride_service.model,
        "topic": body.topic,
        "trajectory": trajectory,
        "evidence_ids": [paper.id for paper in anchors],
    }
