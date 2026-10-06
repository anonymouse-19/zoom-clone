"""
FastAPI application entry point: builds the app, installs CORS, seeds an empty
database on startup, turns service errors into HTTP responses, and mounts every router.

Called by: uvicorn (`uvicorn app.main:app`) and the test suite (`create_app()`).
Calls: config.get_settings(), seed.run_startup_seed(), and each module in routers/.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.routers import health, meetings, participants, users
from app.seed import run_startup_seed
from app.services.errors import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ServiceError,
    UnavailableError,
)

# Every REST route lives under /api so the API is easy to tell apart from WebSocket
# routes (/ws/...) and easy to proxy as one block later.
API_PREFIX = "/api"

# Only the HTTP methods our API actually uses. An explicit list is easier to defend than
# "*": anything we don't use is refused at the preflight step.
ALLOWED_METHODS = ["GET", "POST", "PATCH", "DELETE"]

# Which HTTP status each kind of service error becomes. Services raise plain Python
# exceptions and never mention HTTP; this table is the only place the two meet.
STATUS_CODE_FOR_ERROR: dict[type[ServiceError], int] = {
    NotFoundError: 404,
    ForbiddenError: 403,
    ConflictError: 409,
    UnavailableError: 503,
}
BAD_REQUEST = 400


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Code before `yield` runs once at startup; code after it runs once at shutdown.

    On startup we seed demo data if the database is empty. That way a fresh deploy
    (or a wiped SQLite file on a free host) comes back with a usable demo.
    """
    if get_settings().seed_on_startup:
        run_startup_seed()
    yield


def handle_service_error(request: Request, error: Exception) -> JSONResponse:
    """Turn a ServiceError into JSON like {"detail": "Only the host can do this"}.

    The {"detail": ...} shape matches FastAPI's own errors, so the frontend reads every
    error message the same way.
    """
    status_code = STATUS_CODE_FOR_ERROR.get(type(error), BAD_REQUEST)
    return JSONResponse(status_code=status_code, content={"detail": str(error)})


def create_app() -> FastAPI:
    """Build and configure a new FastAPI application.

    A factory function (instead of building the app at import time) lets tests create
    a fresh app after changing settings.
    """
    settings = get_settings()

    app = FastAPI(
        title="Zoom Clone API",
        version="0.1.0",
        description="REST + WebSocket backend for a Zoom-style video conferencing app.",
        lifespan=lifespan,
    )

    # INTERVIEW: CORS is enforced by the *browser*, not the server. The server only
    # declares which origins it trusts; the browser blocks the frontend from reading
    # responses from any other origin. Curl/Postman ignore CORS entirely.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        # No cookies or auth headers exist yet (no login), so we don't allow credentials.
        allow_credentials=False,
        allow_methods=ALLOWED_METHODS,
        allow_headers=["Content-Type"],
    )

    app.add_exception_handler(ServiceError, handle_service_error)

    app.include_router(health.router, prefix=API_PREFIX)
    app.include_router(users.router, prefix=API_PREFIX)
    app.include_router(meetings.router, prefix=API_PREFIX)
    app.include_router(participants.router, prefix=API_PREFIX)

    return app


# The module-level instance uvicorn looks for when we run `uvicorn app.main:app`.
app = create_app()
