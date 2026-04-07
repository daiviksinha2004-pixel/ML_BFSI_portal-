from datetime import timedelta
from typing import Any
import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.api.dependencies import get_db
from app.core import security
from app.core.config import settings
from app.models.platform import User, Tenant
from app.models.audit import AuditLog
from app.schemas.token import Token
from app.schemas.user import UserCreate, UserResponse

router = APIRouter()

def log_audit(db: Session, request: Request, action: str, entity_type: str, user_id: uuid.UUID = None, tenant_id: uuid.UUID = None, details: dict = None):
    """Helper function to record operations and IP addresses to the audit trail."""
    # Extract IP and device info straight from the HTTP headers
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    
    audit_entry = AuditLog(
        tenant_id=tenant_id,
        user_id=user_id,
        entity_type=entity_type,
        action=action,
        ip_address=ip_address,
        user_agent=user_agent,
        new_data=details
    )
    db.add(audit_entry)
    db.commit()

@router.post("/login/access-token", response_model=Token)
def login_access_token(
    request: Request, # <-- Injects the raw HTTP request data
    db: Session = Depends(get_db),
    form_data: OAuth2PasswordRequestForm = Depends()
) -> Any:
    """OAuth2 compatible token login, get an access token for future requests."""
    user = db.query(User).filter(User.email == form_data.username).first()
    
    if not user or not security.verify_password(form_data.password, user.password_hash):
        if user:
            # Log the failed login attempt
            log_audit(db, request, "login_failed", "user_session", user.id, user.tenant_id, {"reason": "invalid_password"})
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    elif not user.is_active:
        log_audit(db, request, "login_failed", "user_session", user.id, user.tenant_id, {"reason": "inactive_account"})
        raise HTTPException(status_code=400, detail="Inactive user")
    
    # Log the successful login with their IP and Browser details
    log_audit(db, request, "login_success", "user_session", user.id, user.tenant_id)

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return {
        "access_token": security.create_access_token(
            subject=user.id, expires_delta=access_token_expires
        ),
        "token_type": "bearer",
    }

@router.post("/register", response_model=UserResponse)
def register_user(
    request: Request,
    user_in: UserCreate,
    db: Session = Depends(get_db)
) -> Any:
    """Register a new user to a specific tenant."""
    # Ensure the tenant exists
    tenant = db.query(Tenant).filter(Tenant.id == user_in.tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    # Ensure email is unique
    user = db.query(User).filter(User.email == user_in.email).first()
    if user:
        raise HTTPException(status_code=400, detail="A user with this email already exists.")

    # Create the user
    user = User(
        tenant_id=user_in.tenant_id,
        email=user_in.email,
        password_hash=security.get_password_hash(user_in.password),
        full_name=user_in.full_name,
        role=user_in.role,
        is_active=user_in.is_active
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Log the registration event
    log_audit(db, request, "user_registered", "users", user.id, user.tenant_id, {"email": user.email, "role": user.role})

    return user