"""
Password hashing with scrypt, from Python's standard library (no extra dependency).

Called by: auth_service (sign up, log in) and the seed (the demo accounts' password).

A stored hash looks like "scrypt$16384$8$1$<salt hex>$<hash hex>": the algorithm, its
settings, a random salt, and the result. Keeping the settings in the string means they
can be raised later without breaking passwords that were hashed with the old ones.
"""

import hashlib
import secrets
import threading

# INTERVIEW: scrypt is deliberately slow and memory-hungry (here ~16 MB per attempt).
# That costs us ~50 ms per login, but makes guessing billions of passwords from a
# stolen database far too expensive. A plain SHA-256 would take nanoseconds per guess.
COST = 2**14  # "n": CPU and memory cost
BLOCK_SIZE = 8  # "r"
PARALLELISM = 1  # "p"
SALT_BYTES = 16
HASH_BYTES = 32
MAX_MEMORY_BYTES = 64 * 1024 * 1024  # scrypt refuses to use more than this
ALGORITHM = "scrypt"

# INTERVIEW: at most this many hashes run at once; other logins wait their turn. Each
# hash needs ~16 MB, so without a cap, a burst of login requests could use more memory
# than a small free server has and crash it for everyone.
MAX_CONCURRENT_HASHES = 2
_hashing_slots = threading.BoundedSemaphore(MAX_CONCURRENT_HASHES)


def hash_password(password: str) -> str:
    """Hash `password` with a new random salt.

    The salt makes two users with the same password get different hashes, so one
    precomputed table of common passwords can't crack every account at once.
    """
    salt = secrets.token_bytes(SALT_BYTES)
    digest = _scrypt(password, salt, cost=COST, block_size=BLOCK_SIZE, parallelism=PARALLELISM)
    return "$".join(
        [ALGORITHM, str(COST), str(BLOCK_SIZE), str(PARALLELISM), salt.hex(), digest.hex()]
    )


def verify_password(password: str, stored_hash: str) -> bool:
    """True if `password` produces `stored_hash` (same salt and settings)."""
    algorithm, cost, block_size, parallelism, salt_hex, digest_hex = stored_hash.split("$")
    if algorithm != ALGORITHM:
        return False
    digest = _scrypt(
        password,
        bytes.fromhex(salt_hex),
        cost=int(cost),
        block_size=int(block_size),
        parallelism=int(parallelism),
    )
    # INTERVIEW: compare_digest takes the same time however many leading bytes match,
    # so response times leak nothing about how close a guess was.
    return secrets.compare_digest(digest, bytes.fromhex(digest_hex))


def _scrypt(password: str, salt: bytes, *, cost: int, block_size: int, parallelism: int) -> bytes:
    with _hashing_slots:
        return hashlib.scrypt(
            password.encode(),
            salt=salt,
            n=cost,
            r=block_size,
            p=parallelism,
            maxmem=MAX_MEMORY_BYTES,
            dklen=HASH_BYTES,
        )
