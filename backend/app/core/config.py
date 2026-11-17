from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str
    jwt_secret: str
    jwt_algorithm: str
    # Phase 12: plain-language explanations. Without a key the fixed template is used.
    gemini_api_key: str | None = None
    # Checked 2026-11-18: gemini-2.5-flash is closed to new keys and gemini-3.8-flash answered 503 "high demand";
    # the flash-lite model answered in ~2 s and is enough for a 60-word restatement of stored numbers.
    gemini_model: str = "gemini-3.5-flash-lite"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
