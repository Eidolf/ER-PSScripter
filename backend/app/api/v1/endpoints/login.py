from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

import jwt
import httpx
import pyotp
from pydantic import BaseModel

from app.api import deps
from app.core import security
from app.core.config import settings
from app.models.user import User
from app.schemas.token import Token
from app.schemas.user import MfaVerifyRequest

router = APIRouter()


@router.post("/login/access-token", response_model=Token)
def login_access_token(
    db: Session = Depends(deps.get_db), form_data: OAuth2PasswordRequestForm = Depends()
) -> Any:
    """
    OAuth2 compatible token login, get an access token for future requests
    """
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not user.hashed_password or not security.verify_password(form_data.password, str(user.hashed_password)):
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    elif not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    
    if user.mfa_enabled:
        # Generate temporary token
        mfa_token_expires = timedelta(minutes=10)
        temp_token = security.create_access_token(
            user.id, expires_delta=mfa_token_expires, extra_claims={"type": "mfa_temp"}
        )
        return {
            "mfa_required": True,
            "mfa_token": temp_token,
        }

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


@router.post("/login/verify-mfa", response_model=Token)
def verify_mfa(
    *,
    db: Session = Depends(deps.get_db),
    verify_in: MfaVerifyRequest
) -> Any:
    """
    Verify TOTP MFA code for login.
    """
    try:
        payload = jwt.decode(
            verify_in.mfa_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        if payload.get("type") != "mfa_temp":
            raise HTTPException(status_code=400, detail="Invalid token type")
        user_id = payload.get("sub")
    except (jwt.PyJWTError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid or expired MFA token")
        
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=400, detail="User not found or inactive")
        
    totp = pyotp.TOTP(str(user.mfa_secret))
    if not totp.verify(verify_in.code):
        raise HTTPException(status_code=400, detail="Incorrect authentication code")
        
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return {
        "access_token": security.create_access_token(
            user.id, expires_delta=access_token_expires
        ),
        "token_type": "bearer",
    }


@router.get("/login/entra/url")
def get_entra_login_url() -> Any:
    """
    Generate Microsoft EntraID Authorization Redirect URL.
    """
    if not settings.ENTRA_CLIENT_ID:
        return {"enabled": False, "url": ""}
        
    tenant = settings.ENTRA_TENANT_ID
    url = (
        f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize"
        f"?client_id={settings.ENTRA_CLIENT_ID}"
        f"&response_type=code"
        f"&redirect_uri={settings.ENTRA_REDIRECT_URI}"
        f"&response_mode=query"
        f"&scope=openid profile email User.Read"
    )
    return {"enabled": True, "url": url}


class EntraCallbackRequest(BaseModel):
    code: str


@router.post("/login/entra/callback", response_model=Token)
async def entra_login_callback(
    *,
    db: Session = Depends(deps.get_db),
    callback_in: EntraCallbackRequest
) -> Any:
    """
    Exchange authorization code for access token and login/provision user.
    """
    if not settings.ENTRA_CLIENT_ID or not settings.ENTRA_CLIENT_SECRET:
        raise HTTPException(status_code=400, detail="EntraID is not configured")
        
    tenant = settings.ENTRA_TENANT_ID
    token_url = f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"
    
    data = {
        "client_id": settings.ENTRA_CLIENT_ID,
        "client_secret": settings.ENTRA_CLIENT_SECRET,
        "code": callback_in.code,
        "redirect_uri": settings.ENTRA_REDIRECT_URI,
        "grant_type": "authorization_code",
    }
    
    async with httpx.AsyncClient() as client:
        res = await client.post(token_url, data=data)
        if res.status_code != 200:
            raise HTTPException(status_code=400, detail=f"Failed to fetch token from Microsoft: {res.text}")
        token_data = res.json()
        
    id_token = token_data.get("id_token")
    if not id_token:
        raise HTTPException(status_code=400, detail="No ID Token returned by Microsoft")
        
    claims = jwt.decode(id_token, options={"verify_signature": False})
    
    email = claims.get("email") or claims.get("preferred_username") or claims.get("upn")
    entra_id = claims.get("oid") or claims.get("sub")
    
    if not email:
        raise HTTPException(status_code=400, detail="Could not retrieve email from Microsoft profile")
        
    user = db.query(User).filter((User.email == email) | (User.entra_id == entra_id)).first()
    if not user:
        user = User(
            email=email,
            entra_id=entra_id,
            hashed_password=None,
            is_active=True
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        if not user.entra_id:
            user.entra_id = entra_id
            db.add(user)
            db.commit()
            db.refresh(user)
            
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
        
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return {
        "access_token": security.create_access_token(
            user.id, expires_delta=access_token_expires
        ),
        "token_type": "bearer",
    }
