import datetime

from sqlalchemy import JSON, Column, DateTime, Integer, String, Text

from app.db.base_class import Base


class Snippet(Base):
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    description = Column(Text, nullable=True)
    content = Column(Text, nullable=False)
    tags = Column(JSON, default=list)  # Storing list of strings
    category = Column(String, default="General", index=True)
    source = Column(String, nullable=True)  # File path or URL
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
