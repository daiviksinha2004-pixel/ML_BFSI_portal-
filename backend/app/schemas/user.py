from pydantic import BaseModel, EmailStr
from typing import Optional
from uuid import UUID

class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: str
    is_active: Optional[bool] = True

class UserCreate(UserBase):
    password: str
    tenant_id: UUID
# Used when returning the user data to the React frontend
class UserResponse(UserBase):
    id: UUID
    tenant_id: UUID

    class Config:
        from_attributes = True