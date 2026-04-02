"""Verify the topic hierarchy after ingestion."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from app.db import get_driver


def main() -> None:
    driver = get_driver()
    try:
        with driver.session() as session:
            def n(cypher: str) -> int:
                return session.run(cypher).single()["n"]

            domains   = n("MATCH (d:Domain) RETURN count(d) AS n")
            fields    = n("MATCH (f:Field) RETURN count(f) AS n")
            subfields = n("MATCH (sf:Subfield) RETURN count(sf) AS n")
            topics    = n("MATCH (t:Topic) RETURN count(t) AS n")
            edges     = n("MATCH ()-[r:BELONGS_TO]->() RETURN count(r) AS n")
            orphan_topics = n(
                "MATCH (t:Topic) WHERE NOT (t)-[:BELONGS_TO]->() RETURN count(t) AS n"
            )
            papers_no_topics = n(
                "MATCH (p:Paper) WHERE NOT (p)-[:COVERS]->() RETURN count(p) AS n"
            )

        print("Topic hierarchy verification")
        print(f"  Domains:   {domains}")
        print(f"  Fields:    {fields}")
        print(f"  Subfields: {subfields}")
        print(f"  Topics:    {topics}")
        print(f"  BELONGS_TO edges: {edges}")
        print(f"  Orphan topics (no BELONGS_TO): {orphan_topics}")
        print(f"  Papers with no COVERS edge:    {papers_no_topics}")
    finally:
        driver.close()


if __name__ == "__main__":
    main()
