import base64
import io
import pyotp
import qrcode
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session

from app.api import deps
from app.core.security import get_password_hash
from app.models.user import User
from app.schemas.user import User as UserSchema
from app.schemas.user import UserCreate, UserUpdate, MfaSetupResponse, MfaEnableRequest

router = APIRouter()


@router.get("/", response_model=list[UserSchema])
def read_users(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve users.
    """
    users = db.query(User).offset(skip).limit(limit).all()
    return users


@router.get("/me", response_model=UserSchema)
def read_user_me(
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Get current user.
    """
    return current_user


@router.post("/", response_model=UserSchema)
def create_user(
    *,
    db: Session = Depends(deps.get_db),
    user_in: UserCreate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Create new user.
    """
    user = db.query(User).filter(User.email == user_in.email).first()
    if user:
        raise HTTPException(
            status_code=400,
            detail="The user with this username already exists in the system.",
        )
    user = User(
        email=user_in.email,
        hashed_password=get_password_hash(user_in.password),
        is_active=user_in.is_active,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/{user_id}", response_model=UserSchema)
def update_user(
    *,
    db: Session = Depends(deps.get_db),
    user_id: int,
    user_in: UserUpdate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Update a user.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=404,
            detail="The user with this id does not exist in the system",
        )
    user_data = jsonable_encoder(user)
    update_data = user_in.dict(exclude_unset=True)
    if update_data.get("password"):
         hashed_password = get_password_hash(update_data["password"])
         del update_data["password"]
         update_data["hashed_password"] = hashed_password

    for field in user_data:
        if field in update_data:
            setattr(user, field, update_data[field])
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@router.delete("/{user_id}", response_model=UserSchema)
def delete_user(
    *,
    db: Session = Depends(deps.get_db),
    user_id: int,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Delete a user.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=404,
            detail="The user with this id does not exist in the system",
        )
    if user.id == current_user.id:
         raise HTTPException(
            status_code=400,
            detail="You cannot delete your own user",
        )
         
    db.delete(user)
    db.commit()
    return user


@router.post("/mfa/setup", response_model=MfaSetupResponse)
def setup_mfa(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Generate TOTP secret and QR code for authenticator setup.
    """
    if current_user.mfa_enabled:
        raise HTTPException(status_code=400, detail="MFA is already enabled")
        
    # Generate secret if not already set, or generate a new one
    secret = pyotp.random_base32()
    current_user.mfa_secret = secret
    db.add(current_user)
    db.commit()
    
    otpauth_url = pyotp.totp.TOTP(secret).provisioning_uri(
        name=current_user.email, issuer_name="ER-PSScripter"
    )
    
    # Generate QR Code image as base64
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(otpauth_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    
    buffered = io.BytesIO()
    img.save(buffered, format="PNG")
    qr_code_base64 = base64.b64encode(buffered.getvalue()).decode("utf-8")
    
    return {
        "secret": secret,
        "otpauth_url": otpauth_url,
        "qr_code_base64": f"data:image/png;base64,{qr_code_base64}"
    }


@router.post("/mfa/enable", response_model=UserSchema)
def enable_mfa(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
    enable_in: MfaEnableRequest
) -> Any:
    """
    Verify TOTP code and enable MFA.
    """
    if current_user.mfa_enabled:
        raise HTTPException(status_code=400, detail="MFA is already enabled")
    if not current_user.mfa_secret:
        raise HTTPException(status_code=400, detail="MFA has not been set up yet")
        
    totp = pyotp.TOTP(current_user.mfa_secret)
    if not totp.verify(enable_in.code):
        raise HTTPException(status_code=400, detail="Incorrect code. MFA could not be enabled.")
        
    current_user.mfa_enabled = True
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/mfa/disable", response_model=UserSchema)
def disable_mfa(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Disable MFA for current user.
    """
    if not current_user.mfa_enabled:
        raise HTTPException(status_code=400, detail="MFA is already disabled")
        
    current_user.mfa_enabled = False
    current_user.mfa_secret = None
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return current_user
