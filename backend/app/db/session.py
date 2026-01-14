from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

assert settings.DATABASE_URL, "DATABASE_URL must be set"
engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
