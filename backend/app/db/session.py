from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

# Optimized engine with connection pooling and performance settings
engine = create_engine(
    settings.DATABASE_URL,
    # Connection pooling for better performance
    pool_size=20,          # Base number of connections to maintain
    max_overflow=30,       # Additional connections if needed
    pool_pre_ping=True,    # Validate connections before use
    pool_recycle=3600,     # Recycle connections every hour
    # Performance optimizations
    echo=False,            # Disable SQL logging in production
    future=True,           # Use SQLAlchemy 2.0 style
)

SessionLocal = sessionmaker(
    autocommit=False, 
    autoflush=False, 
    bind=engine,
    expire_on_commit=False  # Keep objects usable after commit
)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
