from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.api.dependencies import get_db

# Import your enterprise AuditLog model
from app.models.audit import AuditLog

router = APIRouter()

@router.get("/logs")
def get_audit_logs(db: Session = Depends(get_db)):
    """Fetches the 50 most recent audit logs and formats them for the React UI."""
    try:
        # Query your model using the occurred_at column
        logs = db.query(AuditLog).order_by(AuditLog.occurred_at.desc()).limit(50).all()
        
        serialized_logs = []
        for log in logs:
            # Dynamically calculate the "Status" based on your 'action' string
            action_lower = str(log.action).lower()
            if "fail" in action_lower or "error" in action_lower or "delete" in action_lower:
                status = "Warning"
            else:
                status = "Success"
                
            serialized_logs.append({
                "id": log.id,
                # Convert complex Postgres types to standard strings for the frontend
                "timestamp": log.occurred_at.isoformat() if log.occurred_at else None,
                "username": str(log.user_id) if log.user_id else "System", 
                "ip_address": str(log.ip_address) if log.ip_address else "Internal",
                "event_type": f"{log.entity_type}: {log.action}",
                # Use user_agent or stringified JSONB data for the details column
                "details": str(log.user_agent) if log.user_agent else "System automated action",
                "status": status
            })
            
        return serialized_logs
        
    except Exception as e:
        return {"error": str(e)}