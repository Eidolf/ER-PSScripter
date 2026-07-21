
from pydantic import BaseModel


class Token(BaseModel):
    access_token: str | None = None
    token_type: str | None = None
    mfa_required: bool | None = False
    mfa_token: str | None = None


class TokenPayload(BaseModel):
    sub: str | None = None
