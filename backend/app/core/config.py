import os
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseSettings):
    # API settings
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "TradeJournal"
    
    # Security
    SECRET_KEY: str = os.getenv("SECRET_KEY", "development_secret_key")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    ALGORITHM: str = "HS256"
    
    # Database - Railway provides DATABASE_URL automatically
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./trade_journal.db")
    
    # Redis cache
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    
    # Email settings
    EMAIL_PROVIDER: str = os.getenv("EMAIL_PROVIDER", "smtp")  # smtp, sendgrid, resend, mailgun
    
    # SMTP settings (for custom SMTP)
    SMTP_SERVER: str = os.getenv("SMTP_SERVER", "smtp.gmail.com")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USERNAME: str = os.getenv("SMTP_USERNAME", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    FROM_EMAIL: str = os.getenv("FROM_EMAIL", "noreply@tradejournal.trade")
    FROM_NAME: str = os.getenv("FROM_NAME", "TradeJournal")
    
    # Transactional email service API keys
    SENDGRID_API_KEY: str = os.getenv("SENDGRID_API_KEY", "")
    RESEND_API_KEY: str = os.getenv("RESEND_API_KEY", "")
    MAILGUN_API_KEY: str = os.getenv("MAILGUN_API_KEY", "")
    MAILGUN_DOMAIN: str = os.getenv("MAILGUN_DOMAIN", "")
    
    # App settings
    APP_NAME: str = "TradeJournal"
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173")
    
    # CORS - Read from environment variable for production
    CORS_ORIGINS: str = os.getenv("CORS_ORIGINS", "http://localhost:5173")
    
    # External APIs
    BROKER_API_KEY: str = os.getenv("BROKER_API_KEY", "")
    MARKET_DATA_API_KEY: str = os.getenv("MARKET_DATA_API_KEY", "")
    
    @property
    def cors_origins_list(self) -> list:
        """Convert CORS_ORIGINS string to list"""
        if not self.CORS_ORIGINS:
            return ["http://localhost:5173"]
        
        # Handle Railway environment variable format
        cors_str = self.CORS_ORIGINS.strip()
        
        # If it starts with [ and ends with ], it might be JSON
        if cors_str.startswith('[') and cors_str.endswith(']'):
            try:
                import json
                return json.loads(cors_str)
            except:
                pass
        
        # Otherwise treat as comma-separated string
        return [origin.strip() for origin in cors_str.split(",") if origin.strip()]
    
    class Config:
        case_sensitive = True


settings = Settings()
