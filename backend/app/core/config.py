from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # API Settings
    PROJECT_NAME: str = "ATS_CRP Enterprise BFSI Analytics"
    API_V1_STR: str = "/api/v1"
    API_V2_STR: str = "/api/v2"   # ✅ ADD THIS

    # Database Settings
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    POSTGRES_SERVER: str
    POSTGRES_PORT: str
    POSTGRES_DB: str

    # Security Settings
    SECRET_KEY: str
    ALGORITHM: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 525600  # 1 year (365 days * 24 hours * 60 minutes)

    # --- AI Settings ---
    OPENAI_API_KEY: str | None = None
    GROQ_API_KEY: str | None = None

    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:
        # Constructs the Postgres connection string automatically
        return f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    # Pydantic v2 specific configuration
    # ADDED: extra="ignore" prevents the server from crashing if you have unlisted variables in .env!
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")

# Instantiate the settings so we can import it elsewhere
settings = Settings()