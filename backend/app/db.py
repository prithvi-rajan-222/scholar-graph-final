from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from neo4j import Driver, GraphDatabase, Session

from app.config import NEO4J_PASSWORD, NEO4J_URI, NEO4J_USER

_driver: Driver | None = None


def get_driver() -> Driver:
    global _driver
    if _driver is None:
        _driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
    return _driver


@contextmanager
def get_session() -> Iterator[Session]:
    driver = get_driver()
    with driver.session() as session:
        yield session


def close_driver() -> None:
    global _driver
    if _driver is not None:
        _driver.close()
        _driver = None
