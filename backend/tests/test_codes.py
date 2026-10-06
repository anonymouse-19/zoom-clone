"""
Behaviors proven in this file:
1. Meeting codes are 11 digits and never start with 0.
2. Personal Meeting IDs are 10 digits and never start with 0, so they can't equal a meeting code.
3. Passcodes are 6 letters/digits.
4. Invite tokens are URL-safe and long enough to be unguessable.
5. Generated values are random, not repeating.
"""

import re

from app.services.codes import (
    generate_invite_token,
    generate_meeting_code,
    generate_passcode,
    generate_personal_meeting_id,
)

SAMPLE_SIZE = 200


def test_meeting_codes_are_11_digits_without_a_leading_zero() -> None:
    for _ in range(SAMPLE_SIZE):
        assert re.fullmatch(r"[1-9]\d{10}", generate_meeting_code())


def test_personal_meeting_ids_are_10_digits_without_a_leading_zero() -> None:
    for _ in range(SAMPLE_SIZE):
        assert re.fullmatch(r"[1-9]\d{9}", generate_personal_meeting_id())


def test_passcodes_are_6_alphanumeric_characters() -> None:
    for _ in range(SAMPLE_SIZE):
        assert re.fullmatch(r"[A-Za-z0-9]{6}", generate_passcode())


def test_invite_tokens_are_url_safe_and_long() -> None:
    token = generate_invite_token()
    assert re.fullmatch(r"[A-Za-z0-9_-]+", token)
    assert len(token) >= 32


def test_generated_meeting_codes_do_not_repeat() -> None:
    codes = {generate_meeting_code() for _ in range(SAMPLE_SIZE)}
    # 200 draws from 9×10^10 possibilities: a repeat here would mean a broken generator.
    assert len(codes) == SAMPLE_SIZE
