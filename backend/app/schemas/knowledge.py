import datetime
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict, Field


class KnowledgeEntityBase(BaseModel):
    canonical_name: str
    category: str
    description: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    source_id: Optional[int] = None
    source_url: Optional[str] = None
    source_type: str = "official_microsoft"
    ps_edition: str = "Desktop,Core"
    min_ps_version: Optional[str] = None
    module_name: Optional[str] = None
    trust_level: float = 1.0
    confidence_score: float = 1.0
    structured_details: dict[str, Any] = Field(default_factory=dict)


class KnowledgeEntityCreate(KnowledgeEntityBase):
    pass


class KnowledgeEntityUpdate(BaseModel):
    description: Optional[str] = None
    tags: Optional[list[str]] = None
    ps_edition: Optional[str] = None
    min_ps_version: Optional[str] = None
    module_name: Optional[str] = None
    trust_level: Optional[float] = None
    confidence_score: Optional[float] = None
    structured_details: Optional[dict[str, Any]] = None


class KnowledgeRelationBase(BaseModel):
    from_entity_id: int
    to_entity_id: int
    relation_type: str
    description: Optional[str] = None
    confidence: float = 1.0


class KnowledgeRelationCreate(KnowledgeRelationBase):
    pass


class KnowledgeRelationResponse(KnowledgeRelationBase):
    id: int
    created_at: datetime.datetime
    target_canonical_name: Optional[str] = None
    target_category: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class KnowledgeEntityResponse(KnowledgeEntityBase):
    id: int
    content_hash: Optional[str] = None
    date_indexed: datetime.datetime
    date_updated: datetime.datetime
    outgoing_relations: list[KnowledgeRelationResponse] = Field(default_factory=list)
    incoming_relations: list[KnowledgeRelationResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class KnowledgeSourceBase(BaseModel):
    name: str
    source_type: str
    url: Optional[str] = None
    trust_level: float = 1.0
    is_active: bool = True
    auto_refresh: bool = False
    refresh_frequency_hours: int = 168


class KnowledgeSourceCreate(KnowledgeSourceBase):
    pass


class KnowledgeSourceResponse(KnowledgeSourceBase):
    id: int
    last_crawled_at: Optional[datetime.datetime] = None
    created_at: datetime.datetime
    updated_at: datetime.datetime
    entity_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class KnowledgeSearchQuery(BaseModel):
    query: str
    category: Optional[str] = None
    module_name: Optional[str] = None
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
