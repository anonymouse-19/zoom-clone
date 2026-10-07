"""
Accounts and sign-in sessions: sign up, log in, log out, and "whose token is this?".

Called by: routers/auth.py, and deps.get_current_user on every signed-in request.
Like every service, it raises ServiceErrors and knows nothing about HTTP.
"""

import hashlib
import secrets
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuthSession, Meeting, MeetingSettings, User
from app.models.enums import MeetingStatus, MeetingType
from app.models.types import utc_now
from app.schemas.auth import LoginRequest, SignupRequest
from app.services import codes
from app.services.attempt_limiter import AttemptLimiter
from app.services.errors import ConflictError, UnauthorizedError, UnavailableError
from app.services.passwords import hash_password, verify_password

# How long a sign-in lasts before the user has to log in again.
SESSION_LIFETIME = timedelta(days=30)
SESSION_TOKEN_BYTES = 32
MAX_CODE_ATTEMPTS = 5
PERSONAL_ROOM_DURATION_MINUTES = 60
# New accounts get one of these for their initials avatar (camera off).
AVATAR_COLORS = ["#0B5CFF", "#7C3AED", "#059669", "#DB2777", "#EA580C", "#0891B2"]
WRONG_CREDENTIALS = "Incorrect email or password"


def sign_up(db: Session, request: SignupRequest) -> tuple[User, str]:
    """Create an account (with its Personal Meeting Room) and sign it in.

    Returns the new user and their session token.
    """
    if _user_by_email(db, request.email) is not None:
        raise ConflictError("An account with this email already exists. Log in instead.")

    user = User(
        name=request.name,
        email=request.email,
        password_hash=hash_password(request.password),
        email_verified=False,  # nothing has proven they own this address
        avatar_color=secrets.choice(AVATAR_COLORS),
        timezone=request.timezone,
        personal_meeting_id=_unused_personal_meeting_id(db),
    )
    db.add(user)
    db.add(_personal_room(user))
    db.commit()
    return user, start_session(db, user)


def log_in(db: Session, request: LoginRequest, *, attempts: AttemptLimiter) -> tuple[User, str]:
    """Check the email and password, and start a session. Returns the user and token.

    `attempts` counts wrong passwords per account: after a few, that account's logins
    are refused for a while (429), so its password can't be guessed by brute force.
    """
    user = _user_by_email(db, request.email)
    # INTERVIEW: the same message whether the email is unknown or the password is wrong,
    # so the login form doesn't confirm which emails have accounts.
    if user is None or user.password_hash is None:
        raise UnauthorizedError(WRONG_CREDENTIALS)
    attempts.check(user.email)  # checked before the (slow) password check
    if not verify_password(request.password, user.password_hash):
        attempts.record_failure(user.email)
        raise UnauthorizedError(WRONG_CREDENTIALS)
    attempts.clear(user.email)
    return user, start_session(db, user)


def start_session(db: Session, user: User) -> str:
    """Create a sign-in session for `user` and return its token (shown only this once)."""
    token = secrets.token_urlsafe(SESSION_TOKEN_BYTES)
    db.add(
        AuthSession(
            user=user,
            token_hash=_fingerprint(token),
            expires_at=utc_now() + SESSION_LIFETIME,
        )
    )
    db.commit()
    return token


def user_for_token(db: Session, token: str) -> User | None:
    """The user a session token belongs to, or None if it's unknown or expired."""
    session = db.scalar(select(AuthSession).where(AuthSession.token_hash == _fingerprint(token)))
    if session is None:
        return None
    if session.expires_at <= utc_now():
        db.delete(session)  # tidy up: an expired session can never be used again
        db.commit()
        return None
    return session.user


def log_out(db: Session, token: str) -> None:
    """End the session this token belongs to. Doing it twice is harmless."""
    session = db.scalar(select(AuthSession).where(AuthSession.token_hash == _fingerprint(token)))
    if session is not None:
        db.delete(session)
        db.commit()


def _fingerprint(token: str) -> str:
    """SHA-256 of the token: what the database stores instead of the token itself.

    A fast hash is fine here (unlike for passwords): the token is 32 random bytes, so
    there's nothing to guess, however fast each guess is.
    """
    return hashlib.sha256(token.encode()).hexdigest()


def _user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email))


def _unused_personal_meeting_id(db: Session) -> str:
    """A 10-digit Personal Meeting ID no other user has."""
    for _attempt in range(MAX_CODE_ATTEMPTS):
        candidate = codes.generate_personal_meeting_id()
        taken = db.scalar(select(User.id).where(User.personal_meeting_id == candidate))
        if taken is None:
            return candidate
    raise UnavailableError("Couldn't create your account right now. Please try again.")


def _personal_room(user: User) -> Meeting:
    """The new user's reusable Personal Meeting Room. Its code is their PMI."""
    meeting = Meeting(
        host=user,
        meeting_code=user.personal_meeting_id,
        title=f"{user.name}'s Personal Meeting Room",
        type=MeetingType.PERSONAL,
        status=MeetingStatus.SCHEDULED,
        start_time=None,
        duration_minutes=PERSONAL_ROOM_DURATION_MINUTES,
        timezone=user.timezone,
        passcode=codes.generate_passcode(),
        invite_token=codes.generate_invite_token(),
    )
    meeting.settings = MeetingSettings()
    return meeting
