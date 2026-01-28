import logging

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import get_password_hash
from app.models.user import User
from app.schemas.user import UserCreate

logger = logging.getLogger(__name__)

def init_db(db: Session) -> None:
    # Tables are created by Alembic, so we just seed data here
    
    # Check if ANY user exists (to avoid re-creating default admin if customer created their own)
    first_user = db.query(User).first()
    if not first_user:
        logger.info(f"No users found. Creating default superuser {settings.FIRST_SUPERUSER}")
        user_in = UserCreate(
            email=settings.FIRST_SUPERUSER,
            password=settings.FIRST_SUPERUSER_PASSWORD,
            is_active=True,
        )
        user = User(
            email=user_in.email,
            hashed_password=get_password_hash(user_in.password),
            is_active=user_in.is_active,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        logger.info("Default superuser created successfully")
    else:
        logger.info("Users already exist. Skipping default superuser creation.")
