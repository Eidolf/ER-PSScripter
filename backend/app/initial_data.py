
import logging

from sqlalchemy.orm import Session

from app.core.security import get_password_hash
from app.db.session import SessionLocal
from app.models.user import User

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def init_db(db: Session) -> None:
    # Check if user exists
    user = db.query(User).filter(User.email == "admin@example.com").first()
    if not user:
        user_in = User(
            email="admin@example.com",
            hashed_password=get_password_hash("admin"),
            is_active=True,
        )
        db.add(user_in)
        db.commit()
        db.refresh(user_in)
        logger.info("User created: admin@example.com / admin")
    else:
        logger.info("User admin@example.com already exists")

def main() -> None:
    logger.info("Creating initial data")
    db = SessionLocal()
    init_db(db)
    logger.info("Initial data created")

if __name__ == "__main__":
    main()
