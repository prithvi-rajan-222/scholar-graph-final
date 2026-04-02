"""Build Topic -> Subfield -> Field -> Domain hierarchy in Neo4j from OpenAlex."""

from __future__ import annotations

import os
import time
from collections.abc import Iterable
from typing import Any

import httpx
from dotenv import load_dotenv
from neo4j import GraphDatabase

from ingestion.models import TopicHierarchyRecord

load_dotenv()

NEO4J_URI = os.environ["NEO4J_URI"]
NEO4J_USER = os.environ["NEO4J_USER"]
NEO4J_PASSWORD = os.environ["NEO4J_PASSWORD"]
OPENALEX_MAILTO = os.environ["OPENALEX_MAILTO"]

TOPICS_URL = "https://api.openalex.org/topics"
BATCH_SIZE = 50


def _strip(url: str) -> str:
    prefix = "https://openalex.org/"
    return url[len(prefix):] if url and url.startswith(prefix) else url


def _get(params: dict[str, Any]) -> dict[str, Any]:
    for attempt in range(5):
        try:
            response = httpx.get(TOPICS_URL, params={**params, "mailto": OPENALEX_MAILTO}, timeout=30)
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
    raise RuntimeError("OpenAlex request failed after 5 attempts")


def _fetch_topics(ids: list[str]) -> list[TopicHierarchyRecord]:
    results: list[TopicHierarchyRecord] = []
    for index in range(0, len(ids), BATCH_SIZE):
        batch = ids[index : index + BATCH_SIZE]
        try:
            data = _get({"filter": f"openalex_id:{'|'.join(batch)}", "per_page": BATCH_SIZE})
            results.extend(TopicHierarchyRecord.model_validate(item) for item in data.get("results", []))
        except RuntimeError:
            print(f"  WARNING: Failed to fetch batch at index {index}, skipping")
        time.sleep(0.3)
    return results


def _fetch_all_topics() -> list[TopicHierarchyRecord]:
    results: list[TopicHierarchyRecord] = []
    cursor = "*"
    while cursor:
        try:
            data = _get({"per_page": 200, "cursor": cursor})
        except RuntimeError:
            print("  WARNING: Failed to fetch page, stopping pagination")
            break
        results.extend(TopicHierarchyRecord.model_validate(item) for item in data.get("results", []))
        cursor = data.get("meta", {}).get("next_cursor")
        print(f"  Fetched {len(results)} topics...", end="\r")
        time.sleep(0.3)
    print()
    return results


def _get_neo4j_topics(session) -> tuple[list[str], list[str]]:
    records = session.run("MATCH (t:Topic) RETURN t.id AS id, t.name AS name")
    ids: list[str] = []
    names: list[str] = []
    for record in records:
        if record["id"]:
            ids.append(record["id"])
        elif record["name"]:
            names.append(record["name"])
    return ids, names


def _load_hierarchy(session, topics: Iterable[TopicHierarchyRecord], name_only: list[str]) -> None:
    for cypher in [
        "CREATE INDEX domain_id IF NOT EXISTS FOR (d:Domain) ON (d.id)",
        "CREATE INDEX field_id IF NOT EXISTS FOR (f:Field) ON (f.id)",
        "CREATE INDEX subfield_id IF NOT EXISTS FOR (sf:Subfield) ON (sf.id)",
    ]:
        session.run(cypher)

    topic_by_name = {topic.display_name: topic for topic in topics if topic.display_name}

    for topic in topic_by_name.values():
        topic_id = _strip(topic.id)
        domain_id = _strip(topic.domain.id)
        field_id = _strip(topic.field.id)
        subfield_id = _strip(topic.subfield.id)

        if not (topic_id and domain_id and field_id and subfield_id):
            print(f"  WARNING: Incomplete hierarchy for topic {topic_id!r}, skipping")
            continue

        session.run("MERGE (d:Domain {id: $id}) SET d.name = $name", id=domain_id, name=topic.domain.display_name)
        session.run("MERGE (f:Field {id: $id}) SET f.name = $name", id=field_id, name=topic.field.display_name)
        session.run(
            "MERGE (sf:Subfield {id: $id}) SET sf.name = $name",
            id=subfield_id,
            name=topic.subfield.display_name,
        )
        session.run(
            """
            MERGE (t:Topic {id: $id})
            SET t.name = $name,
                t.description = $description,
                t.works_count = $works_count
            """,
            id=topic_id,
            name=topic.display_name,
            description=topic.description,
            works_count=topic.works_count,
        )
        session.run(
            "MATCH (t:Topic {id: $tid}) MATCH (sf:Subfield {id: $sfid}) MERGE (t)-[:BELONGS_TO]->(sf)",
            tid=topic_id,
            sfid=subfield_id,
        )
        session.run(
            "MATCH (sf:Subfield {id: $sfid}) MATCH (f:Field {id: $fid}) MERGE (sf)-[:BELONGS_TO]->(f)",
            sfid=subfield_id,
            fid=field_id,
        )
        session.run(
            "MATCH (f:Field {id: $fid}) MATCH (d:Domain {id: $did}) MERGE (f)-[:BELONGS_TO]->(d)",
            fid=field_id,
            did=domain_id,
        )

    for name in name_only:
        topic = topic_by_name.get(name)
        if topic is None:
            continue

        topic_id = _strip(topic.id)
        subfield_id = _strip(topic.subfield.id)
        session.run(
            """
            MATCH (t:Topic)
            WHERE t.id IS NULL AND t.name = $name
            SET t.id = $tid,
                t.description = $description,
                t.works_count = $works_count
            """,
            name=name,
            tid=topic_id,
            description=topic.description,
            works_count=topic.works_count,
        )
        if subfield_id:
            session.run(
                "MATCH (t:Topic {id: $tid}) MATCH (sf:Subfield {id: $sfid}) MERGE (t)-[:BELONGS_TO]->(sf)",
                tid=topic_id,
                sfid=subfield_id,
            )


def _print_stats(session) -> None:
    def count(cypher: str) -> int:
        return session.run(cypher).single()["n"]

    domains = count("MATCH (d:Domain) RETURN count(d) AS n")
    fields = count("MATCH (f:Field) RETURN count(f) AS n")
    subfields = count("MATCH (sf:Subfield) RETURN count(sf) AS n")
    enriched = count("MATCH (t:Topic) WHERE t.description IS NOT NULL RETURN count(t) AS n")
    unmatched = count("MATCH (t:Topic) WHERE t.description IS NULL RETURN count(t) AS n")
    edges = count("MATCH ()-[r:BELONGS_TO]->() RETURN count(r) AS n")
    total = enriched + unmatched

    print("Hierarchy complete")
    print(f"  Domains:   {domains}")
    print(f"  Fields:    {fields}")
    print(f"  Subfields: {subfields}")
    print(f"  Topics enriched: {enriched} / {total}")
    print(f"  Topics unmatched: {unmatched}")
    print(f"  BELONGS_TO edges: {edges}")


def main() -> None:
    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
    try:
        with driver.session() as session:
            topic_ids, name_only = _get_neo4j_topics(session)

        print(f"Found {len(topic_ids)} topics with IDs, {len(name_only)} name-only topics in Neo4j")

        topics: list[TopicHierarchyRecord] = []
        if topic_ids:
            print(f"Fetching {len(topic_ids)} topics from OpenAlex in batches of {BATCH_SIZE}...")
            topics = _fetch_topics(topic_ids)
            print(f"Fetched {len(topics)} topic records from OpenAlex")
            missing = len(topic_ids) - len(topics)
            if missing > 0:
                print(f"  WARNING: {missing} topic ID(s) not found in OpenAlex")
        elif name_only:
            print("No topic IDs in Neo4j — fetching all OpenAlex topics for name matching...")
            topics = _fetch_all_topics()
            print(f"Fetched {len(topics)} total topics from OpenAlex")

        with driver.session() as session:
            _load_hierarchy(session, topics, name_only)

        with driver.session() as session:
            _print_stats(session)
    finally:
        driver.close()


if __name__ == "__main__":
    main()
