from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any
from urllib.parse import unquote

from fastapi import APIRouter, HTTPException, Query

from app.config import DEMO_USER_ID
from app.db import get_session
from app.models.graph import (
    Author,
    AuthorDetail,
    GraphResponse,
    LearningPathItem,
    LearningPathResponse,
    LearningPathTarget,
    PaperDetail,
    ProfessorSearchResult,
    SearchResponse,
    Topic,
    TopicResult,
)
from app.product_db import get_product_session
from app.repositories.graph_repository import GraphRepository
from app.repositories.product_repository import ProductRepository
from app.services.graph_builders import (
    build_hierarchy_node,
    build_links,
    build_paper_node,
    build_paper_summary,
    build_simple_node,
)

router = APIRouter()
DEFAULT_USER = DEMO_USER_ID

Record = Mapping[str, Any]

HIERARCHY_PAPER_COUNT_SUBQUERY = """
CALL {
    WITH n
    OPTIONAL MATCH (topic:Topic)-[:BELONGS_TO*0..3]->(n)
    OPTIONAL MATCH (p:Paper)-[:COVERS]->(topic)
    RETURN count(DISTINCT p) AS paper_count
}
"""


def _get_read_and_unlocked_ids(session, paper_ids: list[str]) -> tuple[set[str], set[str]]:
    if not paper_ids:
        return set(), set()
    with get_product_session() as product_session:
        read_ids = ProductRepository(product_session).get_read_ids(DEFAULT_USER)
    unlocked_records = session.run(
        """
        MATCH (read:Paper)<-[:CITES]-(paper:Paper)
        WHERE paper.id IN $paper_ids
          AND read.id IN $read_ids
        RETURN DISTINCT paper.id AS id
        """,
        paper_ids=paper_ids,
        read_ids=list(read_ids),
    ).data()
    unlocked_ids = {record["id"] for record in unlocked_records if record.get("id")}
    return read_ids, unlocked_ids


def _build_paper_nodes(
    records: Iterable[Record],
    *,
    read_ids: set[str] | None = None,
    unlocked_ids: set[str] | None = None,
    in_scope_key: str | None = None,
    authored_key: str | None = None,
    referenced_key: str | None = None,
    citing_key: str | None = None,
) -> list:
    seen: set[str] = set()
    nodes = []

    for record in records:
        paper_id = record.get("id")
        if not paper_id or paper_id in seen:
            continue
        nodes.append(
            build_paper_node(
                record,
                read_ids=read_ids,
                unlocked_ids=unlocked_ids,
                in_scope_key=in_scope_key,
                authored_key=authored_key,
                referenced_key=referenced_key,
                citing_key=citing_key,
            )
        )
        seen.add(str(paper_id))

    return nodes


def _append_unique_named_nodes(nodes: list, records: Iterable[Record], *, node_type: str, id_key: str, label_key: str) -> None:
    seen_ids = {node.id for node in nodes}
    for record in records:
        node_id = record.get(id_key)
        if not node_id or node_id in seen_ids:
            continue
        label = str(record.get(label_key) or node_id)
        nodes.append(build_simple_node(node_id=str(node_id), label=label, node_type=node_type))
        seen_ids.add(str(node_id))


@router.get("/hierarchy", response_model=GraphResponse)
async def get_hierarchy():
    nodes_cypher = """
    MATCH (n)
    WHERE n:Domain OR n:Field OR n:Subfield OR n:Topic
    """ + HIERARCHY_PAPER_COUNT_SUBQUERY + """
    RETURN labels(n)[0] as type, n.id as id, n.name as label,
           coalesce(paper_count, n.works_count, 1) as val,
           paper_count
    """
    edges_cypher = """
    MATCH (a)-[r:BELONGS_TO]->(b)
    WHERE a.id IS NOT NULL AND b.id IS NOT NULL
    RETURN a.id as source, b.id as target, 'BELONGS_TO' as type
    """

    with get_session() as session:
        node_records = session.run(nodes_cypher).data()
        edge_records = session.run(edges_cypher).data()

    nodes = [build_hierarchy_node(record) for record in node_records if record.get("id")]
    links = build_links(edge_records)
    return GraphResponse(nodes=nodes, links=links)


@router.get("/topic/{topic_id}/papers", response_model=GraphResponse)
async def topic_papers(topic_id: str):
    papers_cypher = """
    MATCH (p:Paper)-[:COVERS]->(t:Topic {id: $topic_id})
    RETURN p.id as id, p.title as title, p.year as year, p.citationCount as citationCount
    ORDER BY p.citationCount DESC LIMIT 50
    """

    with get_session() as session:
        paper_records = session.run(papers_cypher, topic_id=topic_id).data()
        if not paper_records:
            raise HTTPException(status_code=404, detail="Topic not found or has no papers")

        paper_ids = [record["id"] for record in paper_records if record.get("id")]
        cites_records = session.run(
            """
            MATCH (citing:Paper)-[:CITES]->(cited:Paper)
            WHERE citing.id IN $ids AND cited.id IN $ids
            RETURN cited.id as source, citing.id as target, 'CITED_BY' as type
            """,
            ids=paper_ids,
        ).data()
        read_ids, unlocked_ids = _get_read_and_unlocked_ids(session, paper_ids)

    nodes = _build_paper_nodes(paper_records, read_ids=read_ids, unlocked_ids=unlocked_ids)
    links = build_links(cites_records)
    return GraphResponse(nodes=nodes, links=links)


@router.get("/scope/{node_type}/{node_id:path}/papers", response_model=GraphResponse)
async def scope_papers(node_type: str, node_id: str, limit: int = Query(80, ge=10, le=200)):
    node_id = unquote(node_id)

    normalized_type = node_type.capitalize()
    if normalized_type not in {"Topic", "Subfield", "Field", "Domain"}:
        raise HTTPException(status_code=400, detail="Unsupported scope node type")

    cypher = """
    MATCH (anchor {id: $id})
    WHERE $node_type IN labels(anchor)
    WITH anchor, $node_type AS node_type
    CALL (anchor, node_type) {
        OPTIONAL MATCH (topic:Topic)
        WHERE (
            node_type = 'Topic' AND topic = anchor
        ) OR (
            node_type <> 'Topic' AND (topic)-[:BELONGS_TO*1..3]->(anchor)
        )
        RETURN collect(DISTINCT topic) AS topics
    }
    WITH anchor, [topic IN topics WHERE topic.id IS NOT NULL] AS topics
    CALL (topics) {
        UNWIND topics AS topic
        MATCH (paper:Paper)-[:COVERS]->(topic)
        WITH DISTINCT paper
        ORDER BY coalesce(paper.citationCount, 0) DESC
        RETURN collect(paper)[0..$limit] AS papers
    }
    WITH anchor, topics, papers, [paper IN papers | paper.id] AS in_scope_ids
    CALL (papers) {
        UNWIND papers AS scoped
        OPTIONAL MATCH (scoped)-[:CITES]-(neighbor:Paper)
        WHERE neighbor.id IS NOT NULL
        RETURN collect(DISTINCT neighbor) AS neighbors
    }
    WITH anchor, topics, papers, in_scope_ids, [neighbor IN neighbors WHERE neighbor IS NOT NULL] AS neighbors
    WITH
        anchor,
        topics,
        in_scope_ids,
        reduce(all_papers = papers, neighbor IN neighbors |
            CASE
                WHEN neighbor IN all_papers THEN all_papers
                ELSE all_papers + neighbor
            END
        ) AS all_papers
    CALL (all_papers) {
        UNWIND all_papers AS citing
        MATCH (citing)-[:CITES]->(cited:Paper)
        WHERE cited IN all_papers
        RETURN collect(DISTINCT {
            source: cited.id,
            target: citing.id,
            type: 'CITED_BY'
        }) AS dependency_links
    }
    RETURN
        anchor.id AS anchor_id,
        anchor.name AS anchor_label,
        size(topics) AS topic_count,
        [paper IN all_papers | {
            id: paper.id,
            title: paper.title,
            citationCount: paper.citationCount,
            year: paper.year,
            in_scope: paper.id IN in_scope_ids
        }] AS papers,
        dependency_links,
        in_scope_ids
    """

    with get_session() as session:
        record = session.run(
            cypher,
            id=node_id,
            node_type=normalized_type,
            limit=limit,
        ).single()
        if record is None:
            raise HTTPException(status_code=404, detail="Scope node not found")

        data = record.data()
        if data.get("topic_count", 0) == 0:
            raise HTTPException(status_code=404, detail="No descendant topics found")

        paper_records = data.get("papers", [])
        if not paper_records:
            raise HTTPException(status_code=404, detail="No papers found for this scope")

        paper_ids = [paper["id"] for paper in paper_records if paper.get("id")]
        read_ids, unlocked_ids = _get_read_and_unlocked_ids(session, paper_ids)

    nodes = _build_paper_nodes(
        paper_records,
        read_ids=read_ids,
        unlocked_ids=unlocked_ids,
        in_scope_key="in_scope",
    )
    links = build_links(data.get("dependency_links", []))
    return GraphResponse(nodes=nodes, links=links)


@router.get("/search", response_model=SearchResponse)
async def search(q: str = Query(...), limit: int = Query(20, ge=1, le=100)):
    papers_cypher = """
    MATCH (p:Paper)
    WHERE toLower(p.title) CONTAINS toLower($q)
    RETURN p.id AS id, p.title AS title, p.year AS year, p.citationCount AS citationCount
    ORDER BY p.citationCount DESC LIMIT $limit
    """
    topics_cypher = """
    MATCH (t:Topic)
    WHERE toLower(t.name) CONTAINS toLower($q)
    OPTIONAL MATCH (p:Paper)-[:COVERS]->(t)
    RETURN t.id AS id, t.name AS name,
           t.works_count AS works_count,
           count(DISTINCT p) AS paperCount
    LIMIT 5
    """

    with get_session() as session:
        paper_records = session.run(papers_cypher, q=q, limit=limit).data()
        topic_records = session.run(topics_cypher, q=q).data()
        authors = GraphRepository(session).search_authors(q, limit=8)

    papers = [build_paper_summary(record) for record in paper_records if record.get("id")]
    topics = [TopicResult(**record) for record in topic_records if record.get("id")]
    return SearchResponse(papers=papers, topics=topics, authors=authors)


@router.get("/paper/{paper_id}", response_model=PaperDetail)
async def get_paper(paper_id: str):
    core_cypher = """
    MATCH (p:Paper {id: $id})
    OPTIONAL MATCH (p)-[:AUTHORED_BY]->(a:Author)
    OPTIONAL MATCH (p)-[c:COVERS]->(t:Topic)
    RETURN p, collect(distinct a) as authors,
           collect(distinct {topic: t, score: c.score}) as topics
    """
    cites_cypher = """
    MATCH (p:Paper {id: $id})-[:CITES]->(cited:Paper)
    RETURN cited LIMIT 20
    """
    cited_by_cypher = """
    MATCH (citing:Paper)-[:CITES]->(p:Paper {id: $id})
    RETURN citing LIMIT 20
    """
    prereq_cypher = """
    MATCH (p:Paper {id: $id})-[:REQUIRES_UNDERSTANDING]->(prereq:Paper)
    RETURN prereq
    """

    with get_session() as session:
        core_record = session.run(core_cypher, id=paper_id).single()
        if core_record is None:
            raise HTTPException(status_code=404, detail="Paper not found")

        cites_records = session.run(cites_cypher, id=paper_id).data()
        cited_by_records = session.run(cited_by_cypher, id=paper_id).data()
        prereq_records = session.run(prereq_cypher, id=paper_id).data()

    paper_node = core_record["p"]
    authors = [
        Author(
            id=author["id"],
            name=author.get("name", ""),
            institution=author.get("institution"),
        )
        for author in core_record["authors"]
        if author and author.get("id")
    ]
    topics = [
        Topic(
            id=topic["topic"]["id"],
            name=topic["topic"].get("name", ""),
            score=topic.get("score"),
            paperCount=topic["topic"].get("paperCount"),
        )
        for topic in core_record["topics"]
        if topic.get("topic") and topic["topic"].get("id")
    ]

    cites = [build_paper_summary(record["cited"]) for record in cites_records if record.get("cited")]
    cited_by = [build_paper_summary(record["citing"]) for record in cited_by_records if record.get("citing")]
    prerequisites = [build_paper_summary(record["prereq"]) for record in prereq_records if record.get("prereq")]

    status = None
    with get_product_session() as product_session:
        status = ProductRepository(product_session).get_status_map(DEFAULT_USER).get(paper_id)

    return PaperDetail(
        id=paper_node["id"],
        title=paper_node.get("title"),
        year=paper_node.get("year"),
        abstract=paper_node.get("abstract"),
        citationCount=paper_node.get("citationCount"),
        authors=authors,
        topics=topics,
        cites=cites,
        cited_by=cited_by,
        prerequisites=prerequisites,
        status=status,
    )


@router.get("/paper/{paper_id}/neighbors", response_model=GraphResponse)
async def paper_neighbors(paper_id: str, hops: int = Query(2, ge=1, le=5)):
    cypher = f"""
    MATCH (center:Paper {{id: $id}})
    OPTIONAL MATCH (center)-[:CITES*0..{hops}]-(neighbor:Paper)
    WITH center, collect(DISTINCT neighbor) + [center] AS papers
    UNWIND papers AS p
    OPTIONAL MATCH (p)-[r:CITES]->(cited:Paper)
    WHERE cited IN papers
    OPTIONAL MATCH (p)-[:AUTHORED_BY]->(a:Author)
    RETURN
        collect(DISTINCT {{id: p.id, title: p.title, citationCount: p.citationCount, year: p.year}}) AS paper_nodes,
        collect(DISTINCT {{id: a.id, name: a.name}}) AS author_nodes,
        collect(DISTINCT {{source: startNode(r).id, target: endNode(r).id, type: 'CITES'}}) AS cites_links,
        collect(DISTINCT {{source: p.id, target: a.id, type: 'AUTHORED_BY'}}) AS authored_links
    """

    with get_session() as session:
        record = session.run(cypher, id=paper_id).single()
        if record is None:
            raise HTTPException(status_code=404, detail="Paper not found")

        data = record.data()
        paper_records = data.get("paper_nodes", [])
        paper_ids = [paper["id"] for paper in paper_records if paper.get("id")]
        read_ids, unlocked_ids = _get_read_and_unlocked_ids(session, paper_ids)

    nodes = _build_paper_nodes(paper_records, read_ids=read_ids, unlocked_ids=unlocked_ids)
    _append_unique_named_nodes(nodes, data.get("author_nodes", []), node_type="Author", id_key="id", label_key="name")
    links = build_links(data.get("cites_links", []) + data.get("authored_links", []))
    return GraphResponse(nodes=nodes, links=links)


@router.get("/author/{author_id}/network", response_model=GraphResponse)
async def author_network(author_id: str):
    cypher = """
    MATCH (author:Author {id: $id})
    OPTIONAL MATCH (author)<-[:AUTHORED_BY]-(seed:Paper)
    WITH author, collect(DISTINCT seed) AS authored
    CALL (authored) {
        UNWIND authored AS seed
        OPTIONAL MATCH (seed)-[:CITES]->(cited:Paper)
        WHERE cited.id IS NOT NULL
        RETURN collect(DISTINCT cited) AS cited_neighbors
    }
    CALL (authored) {
        UNWIND authored AS seed
        OPTIONAL MATCH (citing:Paper)-[:CITES]->(seed)
        WHERE citing.id IS NOT NULL
        RETURN collect(DISTINCT citing) AS citing_neighbors
    }
    WITH author, authored,
         [paper IN cited_neighbors WHERE paper IS NOT NULL] AS cited_neighbors,
         [paper IN citing_neighbors WHERE paper IS NOT NULL] AS citing_neighbors
    WITH author, authored, cited_neighbors, citing_neighbors, cited_neighbors + citing_neighbors AS raw_neighbors
    WITH author, authored, cited_neighbors, citing_neighbors,
         reduce(all_papers = authored, paper IN raw_neighbors |
            CASE
                WHEN paper IN all_papers THEN all_papers
                ELSE all_papers + paper
            END
         ) AS papers
    CALL (papers) {
        UNWIND papers AS citing
        MATCH (citing)-[:CITES]->(cited:Paper)
        WHERE cited IN papers
        RETURN collect(DISTINCT {
            source: cited.id,
            target: citing.id,
            type: 'CITED_BY'
        }) AS links
    }
    RETURN author.id AS author_id,
           author.name AS author_name,
           [paper IN papers | {
               id: paper.id,
               title: paper.title,
               citationCount: paper.citationCount,
               year: paper.year,
               in_scope: paper IN authored,
               is_authored: paper IN authored,
               is_referenced: paper IN cited_neighbors,
               is_citing: paper IN citing_neighbors
           }] AS papers,
           links
    """

    with get_session() as session:
        record = session.run(cypher, id=author_id).single()
        if record is None:
            raise HTTPException(status_code=404, detail="Author not found")
        data = record.data()
        paper_records = data.get("papers", [])
        if not paper_records:
            raise HTTPException(status_code=404, detail="No papers found for author")
        paper_ids = [paper["id"] for paper in paper_records if paper.get("id")]
        read_ids, unlocked_ids = _get_read_and_unlocked_ids(session, paper_ids)

    nodes = _build_paper_nodes(
        paper_records,
        read_ids=read_ids,
        unlocked_ids=unlocked_ids,
        in_scope_key="in_scope",
        authored_key="is_authored",
        referenced_key="is_referenced",
        citing_key="is_citing",
    )
    links = build_links(data.get("links", []))
    return GraphResponse(nodes=nodes, links=links)


@router.get("/learning-path", response_model=LearningPathResponse)
async def learning_path(
    topic: str | None = Query(None),
    paper_id: str | None = Query(None),
):
    if not topic and not paper_id:
        raise HTTPException(status_code=400, detail="Provide topic or paper_id")

    with get_session() as session:
        if paper_id:
            record = session.run(
                "MATCH (p:Paper {id: $id}) RETURN p.id as id, p.title as title",
                id=paper_id,
            ).single()
            if record is None:
                raise HTTPException(status_code=404, detail="Paper not found")
            target_id = record["id"]
            target_title = record["title"]
        else:
            record = session.run(
                """
                MATCH (p:Paper)-[:COVERS]->(t:Topic)
                WHERE toLower(t.name) CONTAINS toLower($topic)
                RETURN p.id as id, p.title as title
                ORDER BY p.citationCount DESC LIMIT 1
                """,
                topic=topic,
            ).single()
            if record is None:
                return LearningPathResponse(
                    target=LearningPathTarget(id="", title=topic),
                    learning_path=[],
                    papers_to_read=0,
                    ai_explanation=(
                        f"No papers found covering '{topic}'. "
                        "Try a different topic name."
                    ),
                )
            target_id = record["id"]
            target_title = record["title"]

        prereq_records = session.run(
            """
            MATCH path = (prereq:Paper)-[:REQUIRES_UNDERSTANDING*1..5]->(target:Paper {id: $id})
            WITH prereq, min(length(path)) as depth
            RETURN prereq.id as id, prereq.title as title,
                   prereq.year as year, prereq.citationCount as citationCount,
                   depth
            ORDER BY depth DESC
            """,
            id=target_id,
        ).data()

        with get_product_session() as product_session:
            read_ids = ProductRepository(product_session).get_read_ids(DEFAULT_USER)

    learning_path_items = [
        LearningPathItem(
            id=record["id"],
            title=record["title"],
            year=record["year"],
            citationCount=record["citationCount"],
            depth=record["depth"],
            already_read=record["id"] in read_ids,
        )
        for record in prereq_records
    ]
    unread_count = sum(1 for item in learning_path_items if not item.already_read)

    ai_explanation = ""
    if not learning_path_items:
        ai_explanation = (
            f"'{target_title}' appears to be a foundational paper with no prerequisites "
            "in the graph. It's a good starting point on its own."
        )

    return LearningPathResponse(
        target=LearningPathTarget(id=target_id, title=target_title),
        learning_path=learning_path_items,
        papers_to_read=unread_count,
        ai_explanation=ai_explanation,
    )


@router.get("/explore", response_model=GraphResponse)
async def explore(paper_id: str = Query(...), hops: int = Query(2, ge=1, le=5)):
    cypher = f"""
    MATCH (center:Paper {{id: $id}})
    OPTIONAL MATCH (center)-[:CITES*0..{hops}]-(neighbor:Paper)
    WITH center, collect(DISTINCT neighbor) + [center] AS papers
    UNWIND papers AS p
    OPTIONAL MATCH (p)-[r:CITES]->(cited:Paper)
    WHERE cited IN papers
    OPTIONAL MATCH (p)-[:AUTHORED_BY]->(a:Author)
    OPTIONAL MATCH (p)-[:COVERS]->(t:Topic)
    RETURN
        collect(DISTINCT {{id: p.id, title: p.title, citationCount: p.citationCount}}) AS paper_nodes,
        collect(DISTINCT {{id: a.id, name: a.name}}) AS author_nodes,
        collect(DISTINCT {{name: t.name}}) AS topic_nodes,
        collect(DISTINCT {{source: startNode(r).id, target: endNode(r).id, type: 'CITES'}}) AS cites_links,
        collect(DISTINCT {{source: p.id, target: a.id, type: 'AUTHORED_BY'}}) AS authored_links,
        collect(DISTINCT {{source: p.id, target: t.name, type: 'COVERS'}}) AS covers_links
    """

    with get_session() as session:
        record = session.run(cypher, id=paper_id).single()
        if record is None:
            raise HTTPException(status_code=404, detail="Paper not found")
        data = record.data()

    nodes = _build_paper_nodes(data.get("paper_nodes", []))
    _append_unique_named_nodes(nodes, data.get("author_nodes", []), node_type="Author", id_key="id", label_key="name")
    _append_unique_named_nodes(nodes, data.get("topic_nodes", []), node_type="Topic", id_key="name", label_key="name")
    links = build_links(data.get("cites_links", []) + data.get("authored_links", []) + data.get("covers_links", []))
    return GraphResponse(nodes=nodes, links=links)


@router.get("/author/{author_id}", response_model=AuthorDetail)
async def get_author(author_id: str):
    cypher = """
    MATCH (a:Author {id: $id})
    OPTIONAL MATCH (p:Paper)-[:AUTHORED_BY]->(a)
    RETURN
        a.id AS id, a.name AS name,
        collect({id: p.id, title: p.title, year: p.year,
                 abstract: p.abstract, citationCount: p.citationCount}) AS papers
    """

    with get_session() as session:
        record = session.run(cypher, id=author_id).single()
        if record is None:
            raise HTTPException(status_code=404, detail="Author not found")

    data = record.data()
    papers = [build_paper_summary(paper) for paper in data.get("papers", []) if paper.get("id")]
    papers.sort(key=lambda paper: paper.citationCount or 0, reverse=True)
    return AuthorDetail(id=data["id"], name=data["name"], papers=papers)
