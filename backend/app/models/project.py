import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, relationship

from app.db.base_class import Base

if TYPE_CHECKING:
    from app.models.snippet import Snippet

class Project(Base):
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    description = Column(Text, nullable=True)
    user_id = Column(Integer, ForeignKey("user.id"), nullable=True)  # Optional for now, or link to User
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    snippets: Mapped[list["Snippet"]] = relationship("Snippet", back_populates="project", cascade="all, delete-orphan")
    # user = relationship("User", back_populates="projects")
    # Uncomment when User model is fully integrated with relationships
