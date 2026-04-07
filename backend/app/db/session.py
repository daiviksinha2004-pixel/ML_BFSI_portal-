from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

# Create the SQLAlchemy engine using the URI from your .env file
# pool_pre_ping=True tests connections before using them to prevent dropouts
engine = create_engine(
    settings.SQLALCHEMY_DATABASE_URI,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20
)

# Create a configured "Session" class
# We set autocommit and autoflush to False for strict, manual transaction control
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)