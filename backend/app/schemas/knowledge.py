import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class KnowledgeEntityBase(BaseModel):
    canonical_name: str
    category: str
    description: str | None = None
    tags: list[str] = Field(default_factory=list)
    source_id: int | None = None
    source_url: str | None = None
    source_type: str = "official_microsoft"
    ps_edition: str = "Desktop,Core"
    min_ps_version: str | None = None
    module_name: str | None = None
    trust_level: float = 1.0
    confidence_score: float = 1.0
    structured_details: dict[str, Any] = Field(default_factory=dict)


class KnowledgeEntityCreate(KnowledgeEntityBase):
    pass


class KnowledgeEntityUpdate(BaseModel):
    description: str | None = None
    tags: list[str] | None = None
    ps_edition: str | None = None
    min_ps_version: str | None = None
    module_name: str | None = None
    trust_level: float | None = None
    confidence_score: float | None = None
    structured_details: dict[str, Any] | None = None


class KnowledgeRelationBase(BaseModel):
    from_entity_id: int
    to_entity_id: int
    relation_type: str
    description: str | None = None
    confidence: float = 1.0


class KnowledgeRelationCreate(KnowledgeRelationBase):
    pass


class KnowledgeRelationResponse(KnowledgeRelationBase):
    id: int
    created_at: datetime.datetime
    target_canonical_name: str | None = None
    target_category: str | None = None

    model_config = ConfigDict(from_attributes=True)


class KnowledgeEntityResponse(KnowledgeEntityBase):
    id: int
    content_hash: str | None = None
    date_indexed: datetime.datetime
    date_updated: datetime.datetime
    outgoing_relations: list[KnowledgeRelationResponse] = Field(default_factory=list)
    incoming_relations: list[KnowledgeRelationResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class KnowledgeSourceBase(BaseModel):
    name: str
    source_type: str
    url: str | None = None
    trust_level: float = 1.0
    is_active: bool = True
    auto_refresh: bool = False
    refresh_frequency_hours: int = 168


class KnowledgeSourceCreate(KnowledgeSourceBase):
    pass


class KnowledgeSourceUpdate(BaseModel):
    name: str | None = None
    source_type: str | None = None
    url: str | None = None
    trust_level: float | None = None
    is_active: bool | None = None
    auto_refresh: bool | None = None
    refresh_frequency_hours: int | None = None

    @field_validator("name", "source_type", mode="before")
    @classmethod
    def reject_null(cls, v: Any, info: Any) -> Any:
        if v is None and info.field_name in ("name", "source_type"):
            raise ValueError(f"'{info.field_name}' cannot be explicitly null.")
        return v


class KnowledgeSourceResponse(KnowledgeSourceBase):
    id: int
    last_crawled_at: datetime.datetime | None = None
    created_at: datetime.datetime
    updated_at: datetime.datetime
    entity_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class KnowledgeSearchQuery(BaseModel):
    query: str
    category: str | None = None
    module_name: str | None = None
    min_trust_level: float = 0.0
    limit: int = 20


class KnowledgeSearchResult(BaseModel):
    entity: KnowledgeEntityResponse
    relevance_score: float
    matched_by: str  # "vector", "exact", "keyword"


class RepositoryHealthMetrics(BaseModel):
    total_entities: int
    total_sources: int
    total_relations: int
    total_modules: int
    total_cmdlets: int
    total_snippets: int
    knowledge_coverage_score: float  # Percentage rating
    documentation_coverage_score: float
    repository_freshness_score: float
    source_quality_score: float
    knowledge_utilization_score: float
    categories_breakdown: dict[str, int]
    weak_areas: list[str]
    learning_recommendations: list[str]
