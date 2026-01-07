
import json

from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "ER-PSScripter"
    API_V1_STR: str = "/api/v1"
    
    # CORS
    BACKEND_CORS_ORIGINS: list[AnyHttpUrl] = []

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    def assemble_cors_origins(cls, v: str | list[str]) -> list[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, list | str):
            if isinstance(v, str) and v.startswith("["):
                return json.loads(v)  # type: ignore
            assert isinstance(v, list)
            return v
        raise ValueError(v)

    # Database
    DATABASE_URL: str = "sqlite:///./dev.db"

    # AI Configuration (OpenAI Compatible)
    AI_API_KEY: str = ""
    AI_MODEL: str = "gpt-4-turbo"

    # Security
    SECRET_KEY: str = "changethis-to-a-secure-random-key-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8  # 8 days

    model_config = SettingsConfigDict(
        case_sensitive=True,
        env_file=".env",
        env_file_encoding="utf-8"
    )

settings = Settings()
