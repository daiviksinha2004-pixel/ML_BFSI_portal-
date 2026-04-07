import uuid
from app.db.session import SessionLocal
from app.models.platform import Tenant, User
from app.core.security import get_password_hash

def seed_database():
    db = SessionLocal()
    try:
        print("--- Starting Database Seeding ---")
        
        # 1. Check if the System Tenant already exists
        tenant = db.query(Tenant).filter(Tenant.code == "SYSTEM").first()
        if not tenant:
            tenant = Tenant(
                id=uuid.UUID('00000000-0000-0000-0000-000000000001'),
                code="SYSTEM",
                name="ATS_CRP Platform",
                is_active=True
            )
            db.add(tenant)
            db.commit()
            db.refresh(tenant)
            print("✅ Created SYSTEM Tenant.")
        else:
            print("ℹ️ SYSTEM Tenant already exists.")

        # 2. Check if the Admin User already exists
        admin_email = "admin@servicesats.com"
        user = db.query(User).filter(User.email == admin_email).first()
        if not user:
            user = User(
                id=uuid.UUID('00000000-0000-0000-0000-000000000002'),
                tenant_id=tenant.id,
                email=admin_email,
                password_hash=get_password_hash("Admin@123"), # Default password
                full_name="System Administrator",
                role="superadmin",
                is_active=True
            )
            db.add(user)
            db.commit()
            print(f"✅ Created Admin User: {admin_email}")
        else:
            print(f"ℹ️ Admin User {admin_email} already exists.")
            
        print("--- Seeding Complete ---")
    except Exception as e:
        print(f"❌ Error during seeding: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_database()