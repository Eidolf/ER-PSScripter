import datetime
from typing import TYPE_CHECKING, Optional

from pgvector.sqlalchemy import Vector
from sqlalchemy import JSON, Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base

if TYPE_CHECKING:
    pass


class KnowledgeSource(Base):
    __tablename__ = "knowledgesource"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True, index=True)
    source_type = Column(String, nullable=False, index=True)  # microsoft_learn, microsoft_repo, psgallery, user_script, community_blog, custom_url
    url = Column(String, nullable=True)
    trust_level = Column(Float, default=1.0)  # Official Microsoft = 1.0, Verified Community = 0.8, Custom = 0.5
    is_active = Column(Boolean, default=True)
    auto_refresh = Column(Boolean, default=False)
    refresh_frequency_hours = Column(Integer, default=168)  # Weekly default
    last_crawled_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    entities: Mapped[list["KnowledgeEntity"]] = relationship("KnowledgeEntity", back_populates="source_rel", cascade="all, delete-orphan")


class KnowledgeEntity(Base):
    __tablename__ = "knowledgeentity"

    id = Column(Integer, primary_key=True, index=True)
    canonical_name = Column(String, nullable=False, index=True)  # e.g., "Get-Process", "Microsoft.Graph.Authentication"
    category = Column(String, nullable=False, index=True)  # cmdlet, parameter, module, function, class, provider, dsc_resource, language_feature, best_practice, security_guidance, authentication_method
    description = Column(Text, nullable=True)
    tags = Column(JSON, default=list)  # List of string tags
    
    source_id = Column(Integer, ForeignKey("knowledgesource.id", ondelete="SET NULL"), nullable=True)
    source_url = Column(String, nullable=True)
    source_type = Column(String, default="official_microsoft", index=True)
    
    ps_edition = Column(String, default="Desktop,Core")  # e.g. "Core", "Desktop,Core", "PowerShell 7+"
    min_ps_version = Column(String, nullable=True)  # e.g., "5.1", "7.0", "7.4"
    module_name = Column(String, nullable=True, index=True)  # e.g. "Microsoft.PowerShell.Management"
    
    trust_level = Column(Float, default=1.0)  # 0.0 - 1.0
    confidence_score = Column(Float, default=1.0)  # Calculated algorithmic confidence
    
    # Detailed technical specs stored as structured JSON (e.g. parameter sets, syntax, output types, security notes, code examples)
    structured_details = Column(JSON, default=dict)
    
    # Vector embedding for semantic search
    embedding: Mapped[list[float] | None] = mapped_column(Vector(1536), nullable=True)
    
    content_hash = Column(String, index=True, nullable=True)
    date_indexed = Column(DateTime, default=datetime.datetime.utcnow)
    date_updated = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    source_rel: Mapped[Optional["KnowledgeSource"]] = relationship("KnowledgeSource", back_populates="entities")

    # Outgoing relationships
    outgoing_relations: Mapped[list["KnowledgeRelation"]] = relationship(
        "KnowledgeRelation",
        foreign_keys="KnowledgeRelation.from_entity_id",
        back_populates="from_entity",
        cascade="all, delete-orphan"
    )
    
    # Incoming relationships
    incoming_relations: Mapped[list["KnowledgeRelation"]] = relationship(
        "KnowledgeRelation",
        foreign_keys="KnowledgeRelation.to_entity_id",
        back_populates="to_entity",
        cascade="all, delete-orphan"
    )


class KnowledgeRelation(Base):
    __tablename__ = "knowledgerelation"

    id = Column(Integer, primary_key=True, index=True)
    from_entity_id = Column(Integer, ForeignKey("knowledgeentity.id", ondelete="CASCADE"), nullable=False, index=True)
    to_entity_id = Column(Integer, ForeignKey("knowledgeentity.id", ondelete="CASCADE"), nullable=False, index=True)
    relation_type = Column(String, nullable=False, index=True)  # requires_module, parameter_of, alternative_to, authenticates_with, best_practice_for, related_to
    description = Column(String, nullable=True)
    confidence = Column(Float, default=1.0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    from_entity: Mapped["KnowledgeEntity"] = relationship("KnowledgeEntity", foreign_keys=[from_entity_id], back_populates="outgoing_relations")
    to_entity: Mapped["KnowledgeEntity"] = relationship("KnowledgeEntity", foreign_keys=[to_entity_id], back_populates="incoming_relations")
