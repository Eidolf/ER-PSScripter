from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.api import deps
from app.core import security
from app.core.config import settings
from app.models.user import User
from app.schemas.token import Token

router = APIRouter()


@router.post("/login/access-token", response_model=Token)
def login_access_token(
    db: Session = Depends(deps.get_db), form_data: OAuth2PasswordRequestForm = Depends()
) -> Any:
    """
    OAuth2 compatible token login, get an access token for future requests
    """
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not security.verify_password(form_data.password, str(user.hashed_password)):
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    elif not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return {
        "access_token": security.create_access_token(
            user.id, expires_delta=access_token_expires
        ),
        "token_type": "bearer",
    }


@router.get("/login/status")
def check_system_status(db: Session = Depends(deps.get_db)) -> Any:
    """
    Check if the system needs initial setup (no users exist).
    """
    user_count = db.query(User).count()
    return {"needs_setup": user_count == 0}


@router.post("/login/setup", response_model=Token)
def system_setup(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(deps.get_db)
) -> Any:
    """
    Initial system setup. Creates the first superuser.
    Only works if no users exist.
    """
    user_count = db.query(User).count()
    if user_count > 0:
        raise HTTPException(
            status_code=403, 
            detail="System is already initialized. Please log in."
        )
    
    # Create Superuser
    user = User(
        email=form_data.username,
        hashed_password=security.get_password_hash(form_data.password),
        is_active=True,
    )
    # If User model has is_superuser, set it.
    if hasattr(User, "is_superuser"):
        user.is_superuser = True  # type: ignore
        
    db.add(user)
    db.commit()
    db.refresh(user)

    # Auto-login
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return {
        "access_token": security.create_access_token(
            user.id, expires_delta=access_token_expires
        ),
        "token_type": "bearer",
    }
