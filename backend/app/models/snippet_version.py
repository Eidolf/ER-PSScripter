import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db.base_class import Base


class SnippetVersion(Base):
    id = Column(Integer, primary_key=True, index=True)
    snippet_id = Column(Integer, ForeignKey("snippet.id", ondelete="CASCADE"), nullable=False)
    version = Column(Integer, nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    content = Column(Text, nullable=False)
    parent_version_id = Column(Integer, ForeignKey("snippetversion.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    snippet = relationship("Snippet", back_populates="versions")
    parent = relationship("SnippetVersion", remote_side=[id], backref="children")
