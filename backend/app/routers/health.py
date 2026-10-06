"""
Health-check route: GET /api/health.

Called by: hosting platforms (Render/Railway poll it to know the server is alive) and the
frontend's connection check in Phase 0. It touches nothing else, so if it answers, the
process is up and routing works.
"""

from fastapi import APIRouter

from app.schemas.health import HealthResponse

# `tags` groups this route under "health" in the auto-generated /docs page.
router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    """Report that the API process is running. No side effects."""
    return HealthResponse(status="ok")
