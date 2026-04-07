from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from datetime import date
from app.api.dependencies import get_db

from app.services.file_validator import validate_csv_headers
from app.services.etl import process_and_load_csv
from app.models.platform import User

def get_current_user_dummy(db: Session = Depends(get_db)):
    return db.query(User).filter(User.email == "admin@servicesats.com").first()

router = APIRouter()

@router.post("/upload/{domain_type}")
async def upload_domain_data(
    domain_type: str, 
    file: UploadFile = File(...),
    dataset_month: date = Form(...), # <-- NEW: Forces the user to provide the dataset's logical month
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dummy) 
):
    """
    Uploads a CSV dataset, validates the schema, and segregates it by the specified month.
    """
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are supported.")
    
    await validate_csv_headers(file, domain_type)
    await file.seek(0)
    
    try:
        rows_inserted = await process_and_load_csv(
            file=file, 
            domain_type=domain_type, 
            db=db, 
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            dataset_month=dataset_month # <-- Pass it to the ETL script
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process CSV: {str(e)}")
    
    return {
        "message": f"Successfully processed {file.filename} into the {dataset_month.strftime('%B %Y')} bucket.",
        "rows_inserted": rows_inserted,
        "domain": domain_type,
        "dataset_month": dataset_month
    }