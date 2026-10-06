"""
Generators for meeting codes, Personal Meeting IDs, passcodes and invite tokens, plus
the display formatting for codes ("123 4567 8901").

Called by: seed.py, and meeting_service.py, which wraps generate_meeting_code() in a
retry-on-collision loop.
Pure functions with no DB access, so they're trivial to test.
"""

import secrets
import string

# 11 digits, displayed as "XXX XXXX XXXX", like Zoom meeting IDs.
MEETING_CODE_LENGTH = 11
# 10 digits, displayed as "XXX XXX XXXX". A different length from meeting codes, so a
# PMI and a generated meeting code can never be equal.
PERSONAL_MEETING_ID_LENGTH = 10
PASSCODE_LENGTH = 6
# Zoom-style passcodes mix letters and digits. 62^6 ≈ 57 billion combinations.
PASSCODE_ALPHABET = string.ascii_letters + string.digits
# 24 random bytes → 32 URL-safe characters (192 bits): impossible to guess.
INVITE_TOKEN_BYTES = 24
# Same strength for the per-join session token that authenticates a WebSocket.
SESSION_TOKEN_BYTES = 24

NONZERO_DIGITS = "123456789"


def _random_digits(length: int) -> str:
    """A random digit string of `length` that never starts with 0.

    No leading zero, so the code survives being treated as a number anywhere
    (spreadsheets, phone keypads) and always displays at its full length.
    """
    first_digit = secrets.choice(NONZERO_DIGITS)
    remaining_digits = "".join(secrets.choice(string.digits) for _ in range(length - 1))
    return first_digit + remaining_digits


# INTERVIEW: `secrets`, not `random`. `random` is predictable: whoever sees enough
# outputs can work out the next ones. Meeting codes and passcodes are access controls,
# so they need a cryptographically secure source.


def generate_meeting_code() -> str:
    """A new 11-digit meeting code. The caller must still check it's unused in the DB."""
    return _random_digits(MEETING_CODE_LENGTH)


def generate_personal_meeting_id() -> str:
    """A new 10-digit Personal Meeting ID."""
    return _random_digits(PERSONAL_MEETING_ID_LENGTH)


def generate_passcode() -> str:
    """A 6-character alphanumeric passcode, e.g. "aB3kX9"."""
    return "".join(secrets.choice(PASSCODE_ALPHABET) for _ in range(PASSCODE_LENGTH))


def generate_invite_token() -> str:
    """A random URL-safe token for invite links."""
    return secrets.token_urlsafe(INVITE_TOKEN_BYTES)


def generate_session_token() -> str:
    """A random secret for one join session. Phase 5's WebSocket requires it."""
    return secrets.token_urlsafe(SESSION_TOKEN_BYTES)


def format_meeting_code(code: str) -> str:
    """Group digits the way Zoom displays them.

    11-digit meeting code → "XXX XXXX XXXX"; 10-digit PMI → "XXX XXX XXXX".
    Anything else is returned unchanged.
    """
    if len(code) == MEETING_CODE_LENGTH:
        return f"{code[:3]} {code[3:7]} {code[7:]}"
    if len(code) == PERSONAL_MEETING_ID_LENGTH:
        return f"{code[:3]} {code[3:6]} {code[6:]}"
    return code
