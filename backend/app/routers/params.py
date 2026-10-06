"""
URL path parameters shared by several routers.
"""

from typing import Annotated

from fastapi import Path

# A meeting code in a URL path: 10 digits (personal room) or 11 digits. Anything else is
# rejected with 422 before reaching our code.
MeetingCode = Annotated[str, Path(pattern=r"^\d{10,11}$", examples=["12345678901"])]
