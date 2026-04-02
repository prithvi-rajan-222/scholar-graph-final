from fastapi import APIRouter, HTTPException

from app.config import DEMO_USER_ID
from app.db import get_session
from app.models.graph import GraphResponse, PaperStatusItem, PaperStatusListResponse, ReadBody, ReadResponse
from app.product_db import get_product_session
from app.repositories.product_repository import ProductRepository
from app.services.graph_builders import build_hierarchy_node, build_links

router = APIRouter()

DEFAULT_USER = DEMO_USER_ID


@router.post("/read", response_model=ReadResponse)
async def mark_read(body: ReadBody):
    cypher_check = "MATCH (p:Paper {id: $paper_id}) RETURN p.id AS id"
    user_id = body.user_id or DEFAULT_USER

    with get_session() as session:
        paper = session.run(cypher_check, paper_id=body.paper_id).single()
        if paper is None:
            raise HTTPException(status_code=404, detail="Paper not found")
    with get_product_session() as product_session:
        ProductRepository(product_session).set_paper_status(user_id, body.paper_id, "read")

    return ReadResponse(success=True, message="Marked as read")


@router.delete("/read", response_model=ReadResponse)
async def unmark_read(body: ReadBody):
    user_id = body.user_id or DEFAULT_USER

    with get_product_session() as product_session:
        ProductRepository(product_session).clear_paper_status(user_id, body.paper_id)

    return ReadResponse(success=True, message="Removed from read")


@router.get("/graph", response_model=GraphResponse)
async def user_graph():
    nodes_cypher = """
    MATCH (n)
    WHERE n:Paper OR n:Author OR n:Topic OR n:Subfield OR n:Field OR n:Domain
    CALL {
        WITH n
        OPTIONAL MATCH (topic:Topic)-[:BELONGS_TO*0..3]->(n)
        OPTIONAL MATCH (p:Paper)-[:COVERS]->(topic)
        RETURN count(DISTINCT p) AS paper_count
    }
    RETURN labels(n)[0] as type, n.id as id,
           coalesce(n.title, n.name) as label,
           CASE
               WHEN n:Paper THEN coalesce(n.citationCount, 1)
               WHEN n:Topic OR n:Subfield OR n:Field OR n:Domain THEN coalesce(paper_count, n.works_count, 1)
               ELSE coalesce(n.works_count, 1)
           END as val,
           paper_count,
           n.year as year
    """
    edges_cypher = """
    MATCH (a)-[r]->(b)
    WHERE type(r) IN ['CITES','AUTHORED_BY','COVERS','BELONGS_TO']
    AND a.id IS NOT NULL AND b.id IS NOT NULL
    RETURN a.id as source, b.id as target, type(r) as type
    """
    with get_session() as session:
        node_records = session.run(nodes_cypher).data()
        edge_records = session.run(edges_cypher).data()

    with get_product_session() as product_session:
        read_ids = ProductRepository(product_session).get_read_ids(DEFAULT_USER)
    nodes = [
        build_hierarchy_node(record).model_copy(
            update={"read": True} if record["type"] == "Paper" and record["id"] in read_ids else {}
        )
        for record in node_records
        if record.get("id")
    ]
    links = build_links(edge_records)
    return GraphResponse(nodes=nodes, links=links)


@router.get("/status", response_model=PaperStatusListResponse)
async def paper_statuses(user_id: str | None = None):
    resolved_user_id = user_id or DEFAULT_USER
    with get_product_session() as product_session:
        status_map = ProductRepository(product_session).get_status_map(resolved_user_id)
    return PaperStatusListResponse(
        user_id=resolved_user_id,
        statuses=[PaperStatusItem(paper_id=paper_id, status=status) for paper_id, status in sorted(status_map.items())],
    )
