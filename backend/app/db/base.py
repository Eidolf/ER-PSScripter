# Import all the models, so that Base has them before being
# imported by Alembic
from app.db.base_class import Base  # noqa
from app.models.snippet import Snippet  # noqa
from app.models.setting import SystemSetting  # noqa
from app.models.user import User  # noqa
from app.models.project import Project  # noqa

__all__ = ["Base", "Snippet", "User", "Project"]
