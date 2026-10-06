"""
The error response shape, and ready-made `responses=` entries so the OpenAPI docs
(/docs) list the errors each route can return, not just its success response.
"""

from typing import Any

from pydantic import BaseModel


class ErrorOut(BaseModel):
    """Every error body looks like this, e.g. {"detail": "Only the host can do this"}."""

    detail: str


def _error(description: str) -> dict[str, Any]:
    return {"model": ErrorOut, "description": description}


NOT_FOUND = {404: _error("No meeting has this code")}
FORBIDDEN = {403: _error("Only the host can do this")}
CONFLICT = {409: _error("Not allowed in the meeting's current state (e.g. it already ended)")}
UNAVAILABLE = {503: _error("Temporary problem; try again")}
