"""
FastAPI dependencies: small functions that routes declare as parameters, and that
FastAPI calls for them before the route runs ("dependency injection").

- get_db: opens one database session per request and always closes it.
- get_current_user: decides who is calling.
- get_session_factory: for the meeting room, which opens many short sessions.
- get_room_manager: the live rooms (who is connected to which meeting).

Called by: every router, through the type aliases below (`DbSession`, `CurrentUser`, ...).
Tests replace get_db and get_session_factory with versions using a temporary database.
"""

from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session, sessionmaker
from starlette.requests import HTTPConnection

from app.db import SessionLocal
from app.models import User
from app.realtime.room_manager import RoomManager
from app.services.errors import UnavailableError

# The seeded "logged-in" user (Alex Morgan). See docs/DECISIONS.md D-025.
DEFAULT_USER_ID = 1


def get_db() -> Iterator[Session]:
    """Yield a session for one request, and close it afterwards, even if the route raised.

    Code before `yield` runs before the route; the `finally` block runs after the
    response, which returns the connection to the pool.
    """
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


DbSession = Annotated[Session, Depends(get_db)]


def get_current_user(db: DbSession) -> User:
    """Return the user making the request.

    INTERVIEW: there's no login, so this always returns the seeded default user. Every
    route gets "who am I" from here, so adding real auth later (e.g. reading a session
    cookie or JWT) means changing this one function, not every route.
    """
    user = db.get(User, DEFAULT_USER_ID)
    if user is None:
        raise UnavailableError("The default user is missing. Restart the server to reseed.")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_session_factory() -> sessionmaker[Session]:
    """The session factory itself, instead of one session.

    A meeting room's WebSocket can stay open for an hour. Holding one session (and its
    transaction) that long would be wasteful, so the room opens a short session for
    each piece of database work instead.
    """
    return SessionLocal


SessionFactory = Annotated[sessionmaker[Session], Depends(get_session_factory)]


def get_room_manager(connection: HTTPConnection) -> RoomManager:
    """The app's one RoomManager, created in main.py.

    `HTTPConnection` is the shared parent of HTTP requests and WebSockets, so the same
    dependency works for the room's WebSocket and for REST routes (e.g. ending a meeting).
    """
    room_manager: RoomManager = connection.app.state.room_manager
    return room_manager


LiveRooms = Annotated[RoomManager, Depends(get_room_manager)]
