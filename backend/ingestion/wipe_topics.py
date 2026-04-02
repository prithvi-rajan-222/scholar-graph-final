"""Remove all Topic, Subfield, Field, and Domain nodes before re-ingestion."""

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
            for label in ("Topic", "Subfield", "Field", "Domain"):
                count = session.run(f"MATCH (n:{label}) RETURN count(n) AS n").single()["n"]
                session.run(f"MATCH (n:{label}) DETACH DELETE n")
                print(f"Deleted {count} {label} nodes")
    finally:
        driver.close()


if __name__ == "__main__":
    main()
