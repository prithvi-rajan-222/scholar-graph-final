from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

NodeType = Literal["Paper", "Author", "Topic", "Subfield", "Field", "Domain", "External"]
ProfessorPaperRole = Literal["authored", "references", "citations"]
PlanPaperRole = Literal["target", "prerequisite", "builds_on", "topic_anchor"]
PaperStatusOption = Literal["to_read", "reading", "read", "skipped"]


class ApiModel(BaseModel):
    model_config = ConfigDict(extra="ignore")


class Author(ApiModel):
    id: str
    name: str
    institution: str | None = None


class Topic(ApiModel):
    id: str | None = None
    name: str
    score: float | None = None
    paperCount: int | None = None


class Paper(ApiModel):
    id: str
    title: str | None = None
    year: int | None = None
    abstract: str | None = None
    citationCount: int | None = None


class PaperDetail(Paper):
    authors: list[Author] = Field(default_factory=list)
    topics: list[Topic] = Field(default_factory=list)
    cites: list[Paper] = Field(default_factory=list)
    cited_by: list[Paper] = Field(default_factory=list)
    prerequisites: list[Paper] = Field(default_factory=list)
    status: PaperStatusOption | None = None


class AuthorDetail(Author):
    papers: list[Paper] = Field(default_factory=list)


class GraphNode(ApiModel):
    id: str
    label: str
    type: NodeType
    val: int | None = None
    paperCount: int | None = None
    citationCount: int | None = None
    year: int | None = None
    read: bool | None = None
    unlocked: bool | None = None
    inScope: bool | None = None
    isAuthored: bool | None = None
    isReferenced: bool | None = None
    isCiting: bool | None = None


class GraphLink(ApiModel):
    source: str
    target: str
    type: str


class GraphResponse(ApiModel):
    nodes: list[GraphNode]
    links: list[GraphLink]


class TopicResult(ApiModel):
    id: str
    name: str
    works_count: int | None = None
    paperCount: int | None = None


class SearchResponse(ApiModel):
    papers: list[Paper]
    topics: list[TopicResult]
    authors: list["ProfessorSearchResult"] = Field(default_factory=list)


class LearningPathItem(ApiModel):
    id: str
    title: str | None = None
    year: int | None = None
    citationCount: int | None = None
    depth: int
    already_read: bool = False


class LearningPathTarget(ApiModel):
    id: str
    title: str | None = None


class LearningPathResponse(ApiModel):
    target: LearningPathTarget
    learning_path: list[LearningPathItem]
    papers_to_read: int
    ai_explanation: str


class ReadBody(ApiModel):
    paper_id: str
    user_id: str | None = None


class ReadResponse(ApiModel):
    success: bool
    message: str


class PaperInPlan(ApiModel):
    id: str
    title: str | None = None
    year: int | None = None
    citationCount: int | None = None
    abstract: str | None = None
    role: PlanPaperRole
    depth: int | None = None


class LessonSection(ApiModel):
    heading: str
    content: str


class PaperLesson(ApiModel):
    paper_id: str
    lesson_title: str
    overview: str
    connection_to_previous: str | None = None
    why_now: str
    key_concepts: list[str] = Field(default_factory=list)
    lesson_sections: list[LessonSection] = Field(default_factory=list)
    check_for_understanding: str
    knowledge_state_after: str
    grounded_in: str


class LearnPlanResponse(ApiModel):
    artifact_id: int | None = None
    created_at: datetime | None = None
    target_title: str
    papers: list[PaperInPlan]
    plan: str
    curriculum: list[PaperLesson] = Field(default_factory=list)
    total_papers: int
    provider: str | None = None
    model: str | None = None
    evidence_ids: list[str] = Field(default_factory=list)


class LearnQuestionRequest(ApiModel):
    target_title: str
    paper: PaperInPlan
    lesson: PaperLesson
    learned_context: str = ""
    question: str


class LearnQuestionResponse(ApiModel):
    answer: str


class ExplainPathRequest(ApiModel):
    paper_ids: list[str] = Field(min_length=1)


class SummarizePaperRequest(ApiModel):
    paper_id: str


class FieldTrajectoryRequest(ApiModel):
    topic: str = Field(min_length=1)


class PaperStatusRequest(ApiModel):
    paper_id: str
    status: PaperStatusOption
    user_id: str | None = None
    note: str | None = None


class PaperStatusItem(ApiModel):
    paper_id: str
    status: PaperStatusOption


class PaperStatusListResponse(ApiModel):
    user_id: str
    statuses: list[PaperStatusItem] = Field(default_factory=list)


class ProfessorSearchResult(ApiModel):
    id: str
    name: str
    institution: str | None = None
    paperCount: int | None = None
    totalCitations: int | None = None


class RecommendationEvidence(ApiModel):
    paper_id: str
    relation: str
    note: str | None = None


class RecommendationItem(ApiModel):
    paper: Paper
    reason: str
    reason_code: str
    evidence: list[RecommendationEvidence] = Field(default_factory=list)


class RecommendationResponse(ApiModel):
    artifact_id: int | None = None
    created_at: datetime | None = None
    user_id: str
    context: str
    provider: str
    model: str
    items: list[RecommendationItem] = Field(default_factory=list)


class TopicMasteryResponse(ApiModel):
    topic: str
    provider: str
    model: str
    configured: bool
    anchors: list[PaperInPlan] = Field(default_factory=list)
    study_plan: str
    evidence_ids: list[str] = Field(default_factory=list)


class ProfessorBriefContext(ApiModel):
    professor: Author
    top_papers: list[Paper] = Field(default_factory=list)
    timeline: list[Paper] = Field(default_factory=list)
    topic_names: list[str] = Field(default_factory=list)
    collaborators: list[dict[str, Any]] = Field(default_factory=list)
    descendant_papers: list[Paper] = Field(default_factory=list)
    referenced_papers: list[Paper] = Field(default_factory=list)
    authored_paper_count: int = 0
    referenced_paper_count: int = 0
    citing_paper_count: int = 0


class ProfessorBriefResponse(ApiModel):
    artifact_id: int | None = None
    created_at: datetime | None = None
    professor: Author
    provider: str
    model: str
    configured: bool
    research_brief: str
    industry_impact: str = ""
    build_on_research: str = ""
    approach_advice: str = ""
    future_directions: list[str] = Field(default_factory=list)
    evidence_ids: list[str] = Field(default_factory=list)
    top_papers: list[Paper] = Field(default_factory=list)
    timeline: list[Paper] = Field(default_factory=list)
    topic_names: list[str] = Field(default_factory=list)
    collaborators: list[dict[str, Any]] = Field(default_factory=list)
    descendant_papers: list[Paper] = Field(default_factory=list)
    referenced_papers: list[Paper] = Field(default_factory=list)
    authored_paper_count: int = 0
    referenced_paper_count: int = 0
    citing_paper_count: int = 0


class GeneratedArtifactSummary(ApiModel):
    id: int
    artifact_type: str
    subject_type: str
    subject_id: str
    created_at: datetime | None = None


class GeneratedArtifactHistoryItem(GeneratedArtifactSummary):
    provider: str
    model: str


class GeneratedArtifactHistoryResponse(ApiModel):
    items: list[GeneratedArtifactHistoryItem] = Field(default_factory=list)


class GeneratedArtifactCatalogItem(GeneratedArtifactSummary):
    provider: str
    model: str
    title: str | None = None


class GeneratedArtifactCatalogResponse(ApiModel):
    items: list[GeneratedArtifactCatalogItem] = Field(default_factory=list)


class DemoBootstrapResponse(ApiModel):
    user_id: str
    provider: str
    model: str
    configured: bool
    featured_topics: list[str] = Field(default_factory=list)
    featured_professors: list[ProfessorSearchResult] = Field(default_factory=list)
