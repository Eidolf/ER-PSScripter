from sqlalchemy import Boolean, Column, Integer, String

from app.db.base_class import Base


class User(Base):
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    entra_id = Column(String(255), unique=True, index=True, nullable=True)
    mfa_secret = Column(String(255), nullable=True)
    mfa_enabled = Column(Boolean, default=False, nullable=False)
