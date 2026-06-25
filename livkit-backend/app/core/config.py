import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    LIVEKIT_API_KEY: str = os.getenv("LIVEKIT_API_KEY", "")
    LIVEKIT_API_SECRET: str = os.getenv("LIVEKIT_API_SECRET", "")
    LIVEKIT_URL: str = os.getenv("LIVEKIT_URL", "")

    BACKEND_HOST: str = os.getenv("BACKEND_HOST", "0.0.0.0")
    BACKEND_PORT: int = int(os.getenv("BACKEND_PORT", "8000"))
    CORS_ALLOWED_ORIGINS: str = os.getenv(
        "CORS_ALLOWED_ORIGINS",
        "*",
    )

    @property
    def cors_allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ALLOWED_ORIGINS.split(",") if origin.strip()]

    def validate_livekit_settings(self) -> None:
        required_values = {
            "LIVEKIT_API_KEY": self.LIVEKIT_API_KEY,
            "LIVEKIT_API_SECRET": self.LIVEKIT_API_SECRET,
            "LIVEKIT_URL": self.LIVEKIT_URL,
        }
        missing = [key for key, value in required_values.items() if not value]
        if missing:
            raise ValueError(f"Missing required environment variables: {', '.join(missing)}")


settings = Settings()