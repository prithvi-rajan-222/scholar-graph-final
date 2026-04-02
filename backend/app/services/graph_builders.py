from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

from app.models.graph import GraphLink, GraphNode, Paper

Record = Mapping[str, Any]


def build_hierarchy_node(record: Record) -> GraphNode:
    return GraphNode(
        id=str(record["id"]),
        label=str(record.get("label") or record["id"]),
        type=str(record["type"]),
        val=_as_int(record.get("val"), fallback=1),
        paperCount=_as_optional_int(record.get("paper_count")),
        year=_as_optional_int(record.get("year")),
    )


def build_paper_node(
    record: Record,
    *,
    read_ids: set[str] | None = None,
    unlocked_ids: set[str] | None = None,
    in_scope_key: str | None = None,
    authored_key: str | None = None,
    referenced_key: str | None = None,
    citing_key: str | None = None,
) -> GraphNode:
    paper_id = str(record["id"])
    read_ids = read_ids or set()
    unlocked_ids = unlocked_ids or set()
    citation_count = _as_optional_int(record.get("citationCount"))

    in_scope = None
    if in_scope_key is not None and in_scope_key in record:
        in_scope = bool(record.get(in_scope_key))

    is_authored = None
    if authored_key is not None and authored_key in record:
        is_authored = bool(record.get(authored_key))

    is_referenced = None
    if referenced_key is not None and referenced_key in record:
        is_referenced = bool(record.get(referenced_key))

    is_citing = None
    if citing_key is not None and citing_key in record:
        is_citing = bool(record.get(citing_key))

    return GraphNode(
        id=paper_id,
        label=str(record.get("title") or paper_id),
        type="Paper",
        val=max(citation_count or 1, 1),
        citationCount=citation_count,
        year=_as_optional_int(record.get("year")),
        read=paper_id in read_ids,
        unlocked=paper_id in unlocked_ids and paper_id not in read_ids,
        inScope=in_scope,
        isAuthored=is_authored,
        isReferenced=is_referenced,
        isCiting=is_citing,
    )


def build_simple_node(
    *,
    node_id: str,
    label: str,
    node_type: str,
    val: int | None = None,
) -> GraphNode:
    return GraphNode(id=node_id, label=label, type=node_type, val=val)


def build_links(records: Iterable[Record], *, default_type: str | None = None) -> list[GraphLink]:
    links: list[GraphLink] = []
    for record in records:
        source = record.get("source")
        target = record.get("target")
        link_type = record.get("type") or default_type
        if not source or not target or not link_type:
            continue
        links.append(GraphLink(source=str(source), target=str(target), type=str(link_type)))
    return links


def build_paper_summary(record: Record) -> Paper:
    return Paper(
        id=str(record["id"]),
        title=_as_optional_str(record.get("title")),
        year=_as_optional_int(record.get("year")),
        abstract=_as_optional_str(record.get("abstract")),
        citationCount=_as_optional_int(record.get("citationCount")),
    )


def _as_optional_int(value: Any) -> int | None:
    if value is None:
        return None
    return int(value)


def _as_int(value: Any, *, fallback: int) -> int:
    if value is None:
        return fallback
    return int(value)


def _as_optional_str(value: Any) -> str | None:
    if value is None:
        return None
    return str(value)
