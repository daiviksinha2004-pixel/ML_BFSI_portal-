from typing import Generator
from app.db.session import SessionLocal

def get_db() -> Generator:
    """
    Dependency function that yields a database session for a single API request,
    and safely closes it when the request is completed.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()