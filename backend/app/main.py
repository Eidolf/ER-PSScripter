from typing import Any, Dict, List

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import ConsoleSpanExporter, SimpleSpanProcessor
from structlog import get_logger

from app.core.config import settings
from app.api.v1.api import api_router

# Observability Setup
trace.set_tracer_provider(TracerProvider())
trace.get_tracer_provider().add_span_processor(  # type: ignore
    SimpleSpanProcessor(ConsoleSpanExporter())
)
tracer = trace.get_tracer(__name__)
logger = get_logger()

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url=f"{settings.API_V1_STR}/docs",
    redoc_url=f"{settings.API_V1_STR}/redoc",
)

# Security: CORS
# Security: CORS
if settings.BACKEND_CORS_ORIGINS:
    origins = [str(origin) for origin in settings.BACKEND_CORS_ORIGINS]
    print(f"DEBUG: Allowed CORS Origins: {origins}")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    print("DEBUG: No CORS Origins configured!")

# Security: Helmet-like headers
@app.middleware("http")
async def add_security_headers(request: Request, call_next: Any) -> Response:
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return response

@app.on_event("startup")
async def startup_event() -> None:
    logger.info("Starting up ER-PSScripter Backend...")

@app.get("/health")
def health_check() -> Dict[str, str]:
    return {"status": "ok"}

@app.get("/ready")
def readiness_check() -> Dict[str, str]:
    return {"status": "ready"}

app.include_router(api_router, prefix=settings.API_V1_STR)
