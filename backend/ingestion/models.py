from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class IngestionModel(BaseModel):
    model_config = ConfigDict(extra="ignore")


class IngestionAuthor(IngestionModel):
    id: str
    name: str = ""
    institution: str = ""


class IngestionTopic(IngestionModel):
    id: str
    name: str = ""
    score: float = 0.0
    subfield_id: str = ""
    subfield_name: str = ""
    field_id: str = ""
    field_name: str = ""
    domain_id: str = ""
    domain_name: str = ""


class IngestionPaper(IngestionModel):
    id: str
    title: str = ""
    year: int | None = None
    abstract: str = ""
    citationCount: int = 0
    authors: list[IngestionAuthor] = Field(default_factory=list)
    topics: list[IngestionTopic] = Field(default_factory=list)
    referenced_works: list[str] = Field(default_factory=list)
    direction: str = "backward"


class TopicHierarchyRef(IngestionModel):
    id: str = ""
    display_name: str = ""


class TopicHierarchyRecord(IngestionModel):
    id: str = ""
    display_name: str = ""
    description: str = ""
    works_count: int = 0
    domain: TopicHierarchyRef = Field(default_factory=TopicHierarchyRef)
    field: TopicHierarchyRef = Field(default_factory=TopicHierarchyRef)
    subfield: TopicHierarchyRef = Field(default_factory=TopicHierarchyRef)
