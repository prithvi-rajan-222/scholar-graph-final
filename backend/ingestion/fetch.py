from __future__ import annotations

import os
import time
from collections import deque
from collections.abc import Mapping
from typing import Any

import httpx

from ingestion.models import IngestionAuthor, IngestionPaper, IngestionTopic

ANCHOR_PAPERS = [
    "W2626778328",
    "W2970641574",
    "W3168867926",
    "W3001279689",
]

BASE_URL = "https://api.openalex.org/works"
BATCH_SIZE = 50
MAX_DEPTH_BACKWARD = 3
MAX_DEPTH_FORWARD = 1
MAX_PAPERS = int(os.getenv("MAX_PAPERS", "500"))

WORK_FIELDS = (
    "id,title,publication_year,cited_by_count,"
    "abstract_inverted_index,authorships,topics,referenced_works"
)


def _strip(url: str) -> str:
    prefix = "https://openalex.org/"
    return url[len(prefix):] if url and url.startswith(prefix) else url


def reconstruct_abstract(inv_index: Mapping[str, list[int]] | None) -> str:
    if not inv_index:
        return ""

    positions: dict[int, str] = {}
    for word, pos_list in inv_index.items():
        for pos in pos_list:
            positions[pos] = word
    return " ".join(positions[index] for index in sorted(positions))


def _get(url: str, params: dict[str, Any], mailto: str) -> dict[str, Any]:
    params = {**params, "mailto": mailto}
    for attempt in range(5):
        try:
            response = httpx.get(url, params=params, timeout=30)
        except httpx.RequestError as exc:
            wait = 2**attempt
            print(f"  Network error, retry {attempt + 1}/5 in {wait}s: {exc}")
            time.sleep(wait)
            continue

        if response.status_code == 429:
            wait = 2**attempt
            print(f"  429 rate-limited, retry {attempt + 1}/5 in {wait}s")
            time.sleep(wait)
            continue

        response.raise_for_status()
        return response.json()

    raise RuntimeError("Request failed after 5 retries")


def _build_authors(work: Mapping[str, Any]) -> list[IngestionAuthor]:
    authors: list[IngestionAuthor] = []
    for authorship in work.get("authorships", []):
        author_obj = authorship.get("author") or {}
        author_id = _strip(author_obj.get("id", ""))
        if not author_id:
            continue

        institutions = authorship.get("institutions", [])
        institution = institutions[0].get("display_name", "") if institutions else ""
        authors.append(
            IngestionAuthor(
                id=author_id,
                name=author_obj.get("display_name", ""),
                institution=institution,
            )
        )
    return authors


def _build_topics(work: Mapping[str, Any]) -> list[IngestionTopic]:
    topics: list[IngestionTopic] = []
    for topic in work.get("topics", []):
        topic_id = _strip(topic.get("id", ""))
        if not topic_id:
            continue

        subfield = topic.get("subfield") or {}
        field = topic.get("field") or {}
        domain = topic.get("domain") or {}
        topics.append(
            IngestionTopic(
                id=topic_id,
                name=topic.get("display_name", ""),
                score=topic.get("score", 0.0),
                subfield_id=_strip(subfield.get("id", "")),
                subfield_name=subfield.get("display_name", ""),
                field_id=_strip(field.get("id", "")),
                field_name=field.get("display_name", ""),
                domain_id=_strip(domain.get("id", "")),
                domain_name=domain.get("display_name", ""),
            )
        )
    return topics


def _build_paper(work: Mapping[str, Any], *, paper_id: str, direction: str) -> IngestionPaper:
    referenced_works = [_strip(ref_url) for ref_url in work.get("referenced_works", []) if ref_url]
    return IngestionPaper(
        id=paper_id,
        title=work.get("title", ""),
        year=work.get("publication_year"),
        abstract=reconstruct_abstract(work.get("abstract_inverted_index")),
        citationCount=work.get("cited_by_count", 0),
        authors=_build_authors(work),
        topics=_build_topics(work),
        referenced_works=referenced_works,
        direction=direction,
    )


def fetch_papers(anchor_ids: list[str] | None = None) -> list[IngestionPaper]:
    anchor_ids = anchor_ids or ANCHOR_PAPERS
    mailto = os.getenv("OPENALEX_MAILTO", "test@example.com")

    visited: set[str] = set()
    queue: deque[tuple[str, int, str]] = deque()
    discovered_via: dict[str, set[str]] = {}
    papers: list[IngestionPaper] = []
    api_calls = 0

    for anchor_id in anchor_ids:
        data = _get(
            BASE_URL,
            {"filter": f"cites:{anchor_id}", "per_page": 200, "select": "id"},
            mailto,
        )
        api_calls += 1

        for work in data.get("results", []):
            citer_id = _strip(work.get("id", ""))
            if not citer_id:
                continue
            discovered_via.setdefault(citer_id, set()).add("forward")
            if citer_id not in visited and len(visited) < MAX_PAPERS:
                visited.add(citer_id)
                queue.append((citer_id, 1, "forward"))

        discovered_via.setdefault(anchor_id, set()).add("backward")
        if anchor_id not in visited:
            visited.add(anchor_id)
            queue.append((anchor_id, 0, "backward"))

    batch_num = 0
    while queue and len(papers) < MAX_PAPERS:
        batch_items: list[tuple[str, int, str]] = []
        while queue and len(batch_items) < BATCH_SIZE:
            batch_items.append(queue.popleft())

        batch_ids = [item[0] for item in batch_items]
        try:
            data = _get(
                BASE_URL,
                {"filter": f"openalex_id:{'|'.join(batch_ids)}", "per_page": BATCH_SIZE, "select": WORK_FIELDS},
                mailto,
            )
            api_calls += 1
        except Exception as exc:
            print(f"  Warning: batch fetch failed, skipping {len(batch_ids)} papers: {exc}")
            time.sleep(0.3)
            continue

        works_by_id = {
            stripped_id: work
            for work in data.get("results", [])
            if (stripped_id := _strip(work.get("id", "")))
        }

        batch_num += 1
        for paper_id, depth, direction in batch_items:
            work = works_by_id.get(paper_id)
            if work is None:
                continue

            directions = discovered_via.get(paper_id, {direction})
            paper_direction = "both" if len(directions) == 2 else next(iter(directions))
            paper = _build_paper(work, paper_id=paper_id, direction=paper_direction)
            papers.append(paper)

            if direction == "backward":
                if depth < MAX_DEPTH_BACKWARD:
                    _enqueue_references(
                        queue,
                        visited,
                        discovered_via,
                        paper.referenced_works,
                        depth=depth + 1,
                        direction="backward",
                    )

                _enqueue_references(
                    queue,
                    visited,
                    discovered_via,
                    paper.referenced_works,
                    depth=1,
                    direction="forward",
                )
            elif direction == "forward" and depth < MAX_DEPTH_FORWARD:
                _enqueue_references(
                    queue,
                    visited,
                    discovered_via,
                    paper.referenced_works,
                    depth=depth + 1,
                    direction="forward",
                )

        print(f"Batch {batch_num}: fetched {len(works_by_id)} papers, total: {len(papers)}/{MAX_PAPERS}")
        if len(papers) >= MAX_PAPERS:
            break
        time.sleep(0.3)

    backward = sum(1 for directions in discovered_via.values() if directions == {"backward"})
    forward = sum(1 for directions in discovered_via.values() if directions == {"forward"})
    both = sum(1 for directions in discovered_via.values() if len(directions) == 2)
    print(
        f"Fetch complete: {len(papers)} papers | "
        f"backward: {backward} | forward: {forward} | both: {both} | "
        f"API calls: {api_calls}"
    )
    return papers


def _enqueue_references(
    queue: deque[tuple[str, int, str]],
    visited: set[str],
    discovered_via: dict[str, set[str]],
    references: list[str],
    *,
    depth: int,
    direction: str,
) -> None:
    for reference_id in references:
        if not reference_id:
            continue
        discovered_via.setdefault(reference_id, set()).add(direction)
        if reference_id not in visited and len(visited) < MAX_PAPERS:
            visited.add(reference_id)
            queue.append((reference_id, depth, direction))
