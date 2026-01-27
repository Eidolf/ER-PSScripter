import datetime
from typing import TYPE_CHECKING, Optional

from pgvector.sqlalchemy import Vector
from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base

if TYPE_CHECKING:
    from app.models.project import Project

class Snippet(Base):
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    description = Column(Text, nullable=True)
    content = Column(Text, nullable=False)
    # Use mapped_column for better Mypy support with pgvector
    embedding: Mapped[list[float] | None] = mapped_column(Vector(1536), nullable=True)
    tags = Column(JSON, default=list)  # Storing list of strings
    category = Column(String, default="General", index=True)
    source = Column(String, nullable=True)  # File path or URL
    
    # Project integration
    project_id = Column(Integer, ForeignKey("project.id"), nullable=True)
    relative_path = Column(String, nullable=True)  # Path relative to project root, e.g., "utils/helper.ps1"
    
    content_hash = Column(String, index=True, nullable=True)  # SHA256 of content for duplicate detection
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    project: Mapped[Optional["Project"]] = relationship("Project", back_populates="snippets")

    @property
    def has_embedding(self) -> bool:
        return self.embedding is not None
