"""
Response shape for the health-check endpoint.

Called by: routers/health.py. Lives in schemas/ like every other Pydantic model, so the
rule "request/response shapes live in schemas/" has no exceptions.
"""

from typing import Literal

from pydantic import BaseModel


class HealthResponse(BaseModel):
    """`Literal["ok"]` documents in OpenAPI that this field can only ever be "ok"."""

    status: Literal["ok"]
