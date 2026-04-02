from __future__ import annotations

import os
import sys

from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

load_dotenv()

from app.db import get_driver
from ingestion.fetch import ANCHOR_PAPERS, fetch_papers
from ingestion.load import create_indexes, load_papers


def print_stats(driver) -> None:
    queries = {
        "Papers": "MATCH (p:Paper) RETURN count(p) AS n",
        "Authors": "MATCH (a:Author) RETURN count(a) AS n",
        "Topics": "MATCH (t:Topic) RETURN count(t) AS n",
        "CITES edges": "MATCH ()-[:CITES]->() RETURN count(*) AS n",
        "AUTHORED_BY edges": "MATCH ()-[:AUTHORED_BY]->() RETURN count(*) AS n",
        "COVERS edges": "MATCH ()-[:COVERS]->() RETURN count(*) AS n",
        "REQUIRES_UNDERSTANDING edges": "MATCH ()-[:REQUIRES_UNDERSTANDING]->() RETURN count(*) AS n",
    }
    print("\n--- Graph Stats ---")
    with driver.session() as session:
        for label, cypher in queries.items():
            result = session.run(cypher).single()
            print(f"  {label}: {result['n']}")
    print("-------------------")


def main() -> None:
    print("=== Scholar Graph Ingestion ===")
    print(f"Anchor papers: {len(ANCHOR_PAPERS)}")

    print("\nStarting BFS fetch...")
    papers = fetch_papers(ANCHOR_PAPERS)
    print(f"Fetched {len(papers)} papers\n")

    driver = get_driver()
    print("Loading into Neo4j...")
    load_papers(papers, driver)

    print("Creating indexes...")
    create_indexes(driver)

    print_stats(driver)
    print("\nIngestion complete.")


if __name__ == "__main__":
    main()
