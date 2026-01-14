
import logging

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.user import User

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def init_db(db: Session) -> None:
    # We no longer create a default user here.
    # The first user will be created via the /setup endpoint on the frontend.
    user_count = db.query(User).count()
    if user_count == 0:
        logger.info("No users found. Waiting for first-run setup.")
    else:
        logger.info(f"Found {user_count} users. Skipping setup.")

def main() -> None:
    logger.info("Creating initial data")
    db = SessionLocal()
    init_db(db)
    logger.info("Initial data created")

if __name__ == "__main__":
    main()
