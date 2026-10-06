"""
Application settings, read once from environment variables (or a local `.env` file).

Called by: main.py (CORS origins); db.py from Phase 1 on (DATABASE_URL).
Why it exists: every tunable value lives in one typed object instead of scattered
`os.environ[...]` calls, and a malformed value fails loudly at startup, not mid-request.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Typed view of the environment. Field names map to env vars case-insensitively
    (`cors_origins` is read from `CORS_ORIGINS`)."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        # Ignore unrelated variables in .env instead of crashing on them.
        extra="ignore",
    )

    # Where the SQLite file lives. Used from Phase 1 on.
    database_url: str = "sqlite:///./zoom_clone.db"

    # Comma-separated browser origins allowed to call the API, e.g.
    # "http://localhost:3000,https://zoom-clone.vercel.app".
    # Kept as a plain string because a comma list is easier to type into a hosting
    # dashboard than the JSON array pydantic-settings would expect for list[str].
    cors_origins: str = "http://localhost:3000"

    # Base URL of the frontend, used later to build invite links.
    frontend_url: str = "http://localhost:3000"

    # Fill an empty database with demo data when the server starts. Tests turn it off.
    seed_on_startup: bool = True

    @property
    def cors_origin_list(self) -> list[str]:
        """Split CORS_ORIGINS into a clean list, dropping blanks and trailing slashes.

        A trailing slash matters: browsers send `Origin: http://localhost:3000` with no
        slash, so "http://localhost:3000/" in the allow-list would never match.
        """
        origins = []
        for raw_origin in self.cors_origins.split(","):
            origin = raw_origin.strip().rstrip("/")
            if origin:
                origins.append(origin)
        return origins


@lru_cache
def get_settings() -> Settings:
    """Return the single shared Settings instance.

    `lru_cache` means the environment is read once per process, not on every call.
    Tests can call `get_settings.cache_clear()` to re-read after changing env vars.
    """
    return Settings()
