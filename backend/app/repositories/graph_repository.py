from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from fastapi import HTTPException

from app.models.graph import Author, Paper, PaperInPlan, ProfessorBriefContext, ProfessorSearchResult, Topic
from app.services.graph_builders import build_paper_summary


class GraphRepository:
    def __init__(self, session):
        self.session = session

    def search_authors(self, query: str, *, limit: int = 8) -> list[ProfessorSearchResult]:
        records = self.session.run(
            """
            MATCH (a:Author)
            WHERE toLower(a.name) CONTAINS toLower($search_term)
            OPTIONAL MATCH (p:Paper)-[:AUTHORED_BY]->(a)
            RETURN a.id AS id,
                   a.name AS name,
                   a.institution AS institution,
                   count(DISTINCT p) AS paperCount,
                   coalesce(sum(coalesce(p.citationCount, 0)), 0) AS totalCitations
            ORDER BY totalCitations DESC, paperCount DESC
            LIMIT $limit
            """,
            search_term=query,
            limit=limit,
        ).data()
        return [ProfessorSearchResult(**record) for record in records if record.get("id")]

    def get_author_detail(self, author_id: str) -> ProfessorBriefContext:
        author_record = self.session.run(
            """
            MATCH (a:Author {id: $id})
            OPTIONAL MATCH (p:Paper)-[:AUTHORED_BY]->(a)
            OPTIONAL MATCH (p)-[:COVERS]->(t:Topic)
            RETURN a.id AS id,
                   a.name AS name,
                   a.institution AS institution,
                   collect(DISTINCT {
                       id: p.id,
                       title: p.title,
                       year: p.year,
                       abstract: p.abstract,
                       citationCount: p.citationCount
                   }) AS papers,
                   collect(DISTINCT t.name)[0..12] AS topic_names
            """,
            id=author_id,
        ).single()
        if author_record is None:
            raise HTTPException(status_code=404, detail="Author not found")

        collaborators = self.session.run(
            """
            MATCH (a:Author {id: $id})<-[:AUTHORED_BY]-(p:Paper)-[:AUTHORED_BY]->(co:Author)
            WHERE co.id <> $id
            RETURN co.id AS id, co.name AS name, co.institution AS institution, count(DISTINCT p) AS shared_papers
            ORDER BY shared_papers DESC, co.name ASC
            LIMIT 8
            """,
            id=author_id,
        ).data()
        descendant_papers = self.session.run(
            """
            MATCH (a:Author {id: $id})<-[:AUTHORED_BY]-(seed:Paper)
            MATCH (desc:Paper)-[:CITES]->(seed)
            RETURN DISTINCT desc.id AS id, desc.title AS title, desc.year AS year,
                   desc.abstract AS abstract, desc.citationCount AS citationCount
            ORDER BY desc.citationCount DESC
            LIMIT 8
            """,
            id=author_id,
        ).data()
        referenced_papers = self.session.run(
            """
            MATCH (a:Author {id: $id})<-[:AUTHORED_BY]-(seed:Paper)-[:CITES]->(ref:Paper)
            RETURN DISTINCT ref.id AS id, ref.title AS title, ref.year AS year,
                   ref.abstract AS abstract, ref.citationCount AS citationCount
            ORDER BY ref.citationCount DESC
            LIMIT 8
            """,
            id=author_id,
        ).data()

        data = author_record.data()
        papers = [build_paper_summary(record) for record in data.get("papers", []) if record.get("id")]
        papers.sort(key=lambda paper: ((paper.year or 0), (paper.citationCount or 0)), reverse=True)
        top_papers = sorted(papers, key=lambda paper: paper.citationCount or 0, reverse=True)[:8]
        descendant_summaries = [build_paper_summary(record) for record in descendant_papers if record.get("id")]
        referenced_summaries = [build_paper_summary(record) for record in referenced_papers if record.get("id")]

        return ProfessorBriefContext(
            professor=Author(id=data["id"], name=data["name"], institution=data.get("institution")),
            top_papers=top_papers,
            timeline=sorted(papers, key=lambda paper: (paper.year or 0, paper.citationCount or 0)),
            topic_names=[name for name in data.get("topic_names", []) if name][:8],
            collaborators=[
                {
                    "id": record["id"],
                    "name": record["name"],
                    "institution": record.get("institution"),
                    "shared_papers": record.get("shared_papers", 0),
                }
                for record in collaborators
                if record.get("id")
            ],
            descendant_papers=descendant_summaries,
            referenced_papers=referenced_summaries,
            authored_paper_count=len(papers),
            referenced_paper_count=len(referenced_summaries),
            citing_paper_count=len(descendant_summaries),
        )

    def get_topic_anchor_papers(self, topic: str, *, limit: int = 5) -> list[PaperInPlan]:
        topic_lc = topic.lower()
        anchor_recs = self.session.run(
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
            WITH p, matched_topics, size(matched_topics) * 3 + title_score + abstract_score AS relevance
            WHERE relevance > 0
            RETURN DISTINCT p.id AS id, p.title AS title, p.year AS year,
                   p.citationCount AS citationCount, p.abstract AS abstract
            ORDER BY relevance DESC, p.citationCount DESC
            LIMIT $limit
            """,
            topic_lc=topic_lc,
            limit=limit,
        ).data()
        return [
            PaperInPlan(
                id=record["id"],
                title=record["title"],
                year=record["year"],
                citationCount=record["citationCount"],
                abstract=record.get("abstract"),
                role="topic_anchor",
            )
            for record in anchor_recs
            if record.get("id")
        ]

    def get_topic_recommendation_candidates(
        self,
        topic: str,
        *,
        read_ids: Iterable[str] = (),
        exclude_ids: Iterable[str] = (),
    ) -> tuple[list[dict[str, Any]], list[str]]:
        read_ids = [paper_id for paper_id in read_ids if paper_id]
        exclude_ids = list(exclude_ids)
        if read_ids:
            read_history_records = self.session.run(
                """
                MATCH (read:Paper)<-[:CITES]-(candidate:Paper)
                WHERE read.id IN $read_ids
                  AND candidate.id IS NOT NULL
                  AND NOT candidate.id IN $exclude_ids
                OPTIONAL MATCH (candidate)-[:COVERS]->(candidate_topic:Topic)
                WITH
                    candidate,
                    collect(DISTINCT {
                        id: read.id,
                        title: read.title,
                        year: read.year,
                        citationCount: read.citationCount
                    }) AS supporting_reads,
                    collect(DISTINCT candidate_topic.name) AS candidate_topic_names
                WITH
                    candidate,
                    supporting_reads,
                    candidate_topic_names,
                    [
                        name IN candidate_topic_names
                        WHERE name IS NOT NULL
                          AND (toLower(name) CONTAINS toLower($topic) OR toLower($topic) CONTAINS toLower(name))
                    ] AS matched_topics,
                    CASE WHEN toLower(coalesce(candidate.title, "")) CONTAINS toLower($topic) THEN 2 ELSE 0 END AS title_score,
                    CASE WHEN toLower(coalesce(candidate.abstract, "")) CONTAINS toLower($topic) THEN 1 ELSE 0 END AS abstract_score
                WITH
                    candidate,
                    supporting_reads,
                    size(supporting_reads) AS shared_read_citation_count,
                    matched_topics,
                    size(matched_topics) * 3 + title_score + abstract_score AS topic_relevance
                WHERE topic_relevance > 0
                RETURN
                    candidate.id AS id,
                    candidate.title AS title,
                    candidate.year AS year,
                    candidate.abstract AS abstract,
                    candidate.citationCount AS citationCount,
                    supporting_reads,
                    shared_read_citation_count,
                    topic_relevance
                ORDER BY shared_read_citation_count DESC, topic_relevance DESC, candidate.citationCount DESC
                LIMIT 12
                """,
                topic=topic,
                read_ids=read_ids,
                exclude_ids=exclude_ids,
            ).data()
            if read_history_records:
                return [
                    {
                        "paper": build_paper_summary(record),
                        "supporting_reads": [
                            support
                            for support in record.get("supporting_reads", [])
                            if isinstance(support, dict) and support.get("id")
                        ],
                        "shared_read_citation_count": int(record.get("shared_read_citation_count") or 0),
                        "topic_relevance": int(record.get("topic_relevance") or 0),
                    }
                    for record in read_history_records
                    if record.get("id")
                ], read_ids

        return self._get_topic_fallback_recommendation_candidates(topic, exclude_ids=exclude_ids)

    def get_read_history_recommendation_candidates(
        self,
        *,
        read_ids: Iterable[str] = (),
        exclude_ids: Iterable[str] = (),
        limit: int = 12,
    ) -> list[dict[str, Any]]:
        read_ids = [paper_id for paper_id in read_ids if paper_id]
        if not read_ids:
            return []

        records = self.session.run(
            """
            MATCH (read:Paper)<-[:CITES]-(candidate:Paper)
            WHERE read.id IN $read_ids
              AND candidate.id IS NOT NULL
              AND NOT candidate.id IN $exclude_ids
            OPTIONAL MATCH (candidate)-[:COVERS]->(candidate_topic:Topic)
            WITH
                candidate,
                collect(DISTINCT {
                    id: read.id,
                    title: read.title,
                    year: read.year,
                    citationCount: read.citationCount
                }) AS supporting_reads,
                collect(DISTINCT candidate_topic.name)[0..8] AS topic_names
            RETURN
                candidate.id AS id,
                candidate.title AS title,
                candidate.year AS year,
                candidate.abstract AS abstract,
                candidate.citationCount AS citationCount,
                supporting_reads,
                topic_names,
                size(supporting_reads) AS shared_read_citation_count
            ORDER BY shared_read_citation_count DESC, candidate.citationCount DESC, candidate.year DESC
            LIMIT $limit
            """,
            read_ids=read_ids,
            exclude_ids=list(exclude_ids),
            limit=limit,
        ).data()
        return [
            {
                "paper": build_paper_summary(record),
                "supporting_reads": [
                    support
                    for support in record.get("supporting_reads", [])
                    if isinstance(support, dict) and support.get("id")
                ],
                "shared_read_citation_count": int(record.get("shared_read_citation_count") or 0),
                "topic_names": [str(name) for name in record.get("topic_names", []) if name],
            }
            for record in records
            if record.get("id")
        ]

    def _get_topic_fallback_recommendation_candidates(
        self,
        topic: str,
        *,
        exclude_ids: Iterable[str] = (),
    ) -> tuple[list[dict[str, Any]], list[str]]:
        exclude_ids = list(exclude_ids)
        records = self.session.run(
            """
            MATCH (anchor:Paper)-[:COVERS]->(t:Topic)
            WHERE toLower(t.name) CONTAINS toLower($topic)
            WITH collect(DISTINCT anchor)[0..6] AS anchors
            UNWIND anchors AS anchor
            OPTIONAL MATCH (anchor)-[:REQUIRES_UNDERSTANDING]->(prereq:Paper)
            OPTIONAL MATCH (desc:Paper)-[:CITES]->(anchor)
            OPTIONAL MATCH (anchor)-[:COVERS]->(topic:Topic)<-[:COVERS]-(adjacent:Paper)
            WITH anchors,
                 collect(DISTINCT prereq) + collect(DISTINCT desc) + collect(DISTINCT adjacent) AS raw_candidates
            UNWIND raw_candidates AS candidate
            WITH anchors, candidate
            WHERE candidate IS NOT NULL AND candidate.id IS NOT NULL AND NOT candidate.id IN $exclude_ids
            RETURN DISTINCT candidate.id AS id, candidate.title AS title, candidate.year AS year,
                   candidate.abstract AS abstract, candidate.citationCount AS citationCount
            ORDER BY candidate.citationCount DESC
            LIMIT 12
            """,
            topic=topic,
            exclude_ids=exclude_ids,
        ).data()
        evidence_ids = [
            record["id"]
            for record in self.session.run(
                """
                MATCH (p:Paper)-[:COVERS]->(t:Topic)
                WHERE toLower(t.name) CONTAINS toLower($topic)
                RETURN p.id AS id
                ORDER BY p.citationCount DESC
                LIMIT 6
                """,
                topic=topic,
            ).data()
            if record.get("id")
        ]
        return [
            {
                "paper": build_paper_summary(record),
                "supporting_reads": [],
                "shared_read_citation_count": 0,
                "topic_relevance": 0,
            }
            for record in records
            if record.get("id")
        ], evidence_ids

    def get_paper_by_id(self, paper_id: str) -> Paper:
        record = self.session.run(
            """
            MATCH (p:Paper {id: $id})
            RETURN p.id AS id, p.title AS title, p.year AS year,
                   p.abstract AS abstract, p.citationCount AS citationCount
            """,
            id=paper_id,
        ).single()
        if record is None:
            raise HTTPException(status_code=404, detail="Paper not found")
        return build_paper_summary(record.data())

    def get_paper_summary_context(self, paper_id: str) -> dict[str, Any]:
        record = self.session.run(
            """
            MATCH (p:Paper {id: $id})
            OPTIONAL MATCH (p)-[:AUTHORED_BY]->(a:Author)
            OPTIONAL MATCH (p)-[:COVERS]->(t:Topic)
            RETURN p.id AS id, p.title AS title, p.abstract AS abstract, p.year AS year,
                   p.citationCount AS citationCount,
                   collect(DISTINCT a.name)[0..6] AS authors,
                   collect(DISTINCT t.name)[0..8] AS topics
            """,
            id=paper_id,
        ).single()
        if record is None:
            raise HTTPException(status_code=404, detail="Paper not found")
        return record.data()
