from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from sqlalchemy import text

from app.db.base_class import Base
from app.db.session import engine, SessionLocal
from app.core.config import settings

# Single import — triggers all model registrations via __init__.py
import app.models  # noqa

from app.api.v1 import auth, ingest, analytics, ml, chat, audit
from app.api.v2 import ml as ml_v2
from app.api.v2.ml_predict import router as v2_ml_predict_router

# Safe — only creates tables that don't exist yet
Base.metadata.create_all(bind=engine, checkfirst=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("--- Checking Database Connection ---")
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        print("✅ Success: Database connection established.")
        db.close()
    except Exception as e:
        print(f"❌ Error: Could not connect to the database.\nDetails: {e}")
    yield
    print("--- Shutting down API ---")


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,      prefix=f"{settings.API_V1_STR}/auth",      tags=["auth"])
app.include_router(ingest.router,    prefix=f"{settings.API_V1_STR}/ingest",    tags=["ingestion"])
app.include_router(analytics.router, prefix=f"{settings.API_V1_STR}/analytics", tags=["analytics"])
app.include_router(ml.router,        prefix=f"{settings.API_V1_STR}/ml",        tags=["machine_learning"])
app.include_router(chat.router,      prefix=f"{settings.API_V1_STR}/chat",      tags=["chatbot"])
app.include_router(audit.router,     prefix=f"{settings.API_V1_STR}/audit",     tags=["audit"])

app.include_router(ml_v2.router,             prefix=f"{settings.API_V2_STR}/ml", tags=["machine_learning_v2"])
app.include_router(v2_ml_predict_router,     prefix="/api/v2/ml")


@app.get("/")
def root():
    return {"message": f"Welcome to the {settings.PROJECT_NAME} API"}