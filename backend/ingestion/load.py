from __future__ import annotations

from neo4j import Driver

from ingestion.models import IngestionPaper


def _safe_str(value: object, max_len: int | None = None) -> str | None:
    if value is None:
        return None
    result = str(value)
    return result[:max_len] if max_len else result


def load_papers(papers: list[IngestionPaper], driver: Driver) -> None:
    visited_ids = {paper.id for paper in papers}
    paper_by_id = {paper.id: paper for paper in papers}

    with driver.session() as session:
        for index, paper in enumerate(papers, start=1):
            title = _safe_str(paper.title, 1000)
            abstract = _safe_str(paper.abstract, 5000)

            session.run(
                """
                MERGE (p:Paper {id: $id})
                SET p.title = $title,
                    p.year = $year,
                    p.abstract = $abstract,
                    p.citationCount = $citationCount
                """,
                id=paper.id,
                title=title,
                year=paper.year,
                abstract=abstract,
                citationCount=paper.citationCount,
            )

            for author in paper.authors:
                session.run(
                    """
                    MERGE (a:Author {id: $id})
                    SET a.name = $name, a.institution = $institution
                    """,
                    id=author.id,
                    name=_safe_str(author.name, 500),
                    institution=_safe_str(author.institution, 500) or "",
                )
                session.run(
                    """
                    MATCH (p:Paper {id: $pid})
                    MATCH (a:Author {id: $aid})
                    MERGE (p)-[:AUTHORED_BY]->(a)
                    """,
                    pid=paper.id,
                    aid=author.id,
                )

            for topic in paper.topics:
                if topic.score < 0.4 or not topic.id:
                    continue

                session.run("MERGE (d:Domain {id: $id}) SET d.name = $name", id=topic.domain_id, name=topic.domain_name)
                session.run("MERGE (f:Field {id: $id}) SET f.name = $name", id=topic.field_id, name=topic.field_name)
                session.run(
                    "MERGE (sf:Subfield {id: $id}) SET sf.name = $name",
                    id=topic.subfield_id,
                    name=topic.subfield_name,
                )
                session.run("MERGE (t:Topic {id: $id}) SET t.name = $name", id=topic.id, name=topic.name)
                session.run(
                    "MATCH (t:Topic {id: $tid}) MATCH (sf:Subfield {id: $sfid}) MERGE (t)-[:BELONGS_TO]->(sf)",
                    tid=topic.id,
                    sfid=topic.subfield_id,
                )
                session.run(
                    "MATCH (sf:Subfield {id: $sfid}) MATCH (f:Field {id: $fid}) MERGE (sf)-[:BELONGS_TO]->(f)",
                    sfid=topic.subfield_id,
                    fid=topic.field_id,
                )
                session.run(
                    "MATCH (f:Field {id: $fid}) MATCH (d:Domain {id: $did}) MERGE (f)-[:BELONGS_TO]->(d)",
                    fid=topic.field_id,
                    did=topic.domain_id,
                )
                session.run(
                    """
                    MATCH (p:Paper {id: $pid})
                    MATCH (t:Topic {id: $tid})
                    MERGE (p)-[:COVERS {score: $score}]->(t)
                    """,
                    pid=paper.id,
                    tid=topic.id,
                    score=topic.score,
                )

            for reference_id in paper.referenced_works:
                if reference_id not in visited_ids:
                    continue

                session.run(
                    """
                    MATCH (a:Paper {id: $src})
                    MATCH (b:Paper {id: $dst})
                    MERGE (a)-[:CITES]->(b)
                    """,
                    src=paper.id,
                    dst=reference_id,
                )

                reference_paper = paper_by_id.get(reference_id)
                if _should_require_understanding(paper, reference_paper):
                    session.run(
                        """
                        MATCH (a:Paper {id: $src})
                        MATCH (b:Paper {id: $dst})
                        MERGE (a)-[:REQUIRES_UNDERSTANDING]->(b)
                        """,
                        src=paper.id,
                        dst=reference_id,
                    )

            if index % 50 == 0:
                print(f"  Loaded {index}/{len(papers)} papers into Neo4j...")

    print(f"Loaded {len(papers)} papers into Neo4j")


def _should_require_understanding(paper: IngestionPaper, reference_paper: IngestionPaper | None) -> bool:
    if paper.year is None or reference_paper is None or reference_paper.year is None:
        return False
    return reference_paper.year <= paper.year - 2 and reference_paper.citationCount > 50


def create_indexes(driver: Driver) -> None:
    indexes = [
        "CREATE INDEX paper_id IF NOT EXISTS FOR (p:Paper) ON (p.id)",
        "CREATE INDEX author_id IF NOT EXISTS FOR (a:Author) ON (a.id)",
        "CREATE INDEX topic_id IF NOT EXISTS FOR (t:Topic) ON (t.id)",
        "CREATE INDEX subfield_id IF NOT EXISTS FOR (sf:Subfield) ON (sf.id)",
        "CREATE INDEX field_id IF NOT EXISTS FOR (f:Field) ON (f.id)",
        "CREATE INDEX domain_id IF NOT EXISTS FOR (d:Domain) ON (d.id)",
    ]
    with driver.session() as session:
        for cypher in indexes:
            session.run(cypher)
    print("Indexes created (or already existed)")


def print_stats(driver: Driver) -> None:
    queries = [
        ("papers", "MATCH (p:Paper) RETURN count(p) as n"),
        ("authors", "MATCH (a:Author) RETURN count(a) as n"),
        ("topics", "MATCH (t:Topic) RETURN count(t) as n"),
        ("cites", "MATCH ()-[r:CITES]->() RETURN count(r) as n"),
        ("prereqs", "MATCH ()-[r:REQUIRES_UNDERSTANDING]->() RETURN count(r) as n"),
    ]
    with driver.session() as session:
        stats = {label: session.run(cypher).single()["n"] for label, cypher in queries}
    print(
        f"Graph stats — papers: {stats['papers']} | authors: {stats['authors']} | "
        f"topics: {stats['topics']} | cites: {stats['cites']} | prereqs: {stats['prereqs']}"
    )
