from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from datetime import date
import tempfile
import shutil
import os
from app.api.dependencies import get_db, get_current_user

from app.services.file_validator import validate_csv_headers
from app.services.etl import process_and_load_csv_async
from app.models.platform import User, Client, Campaign
from app.models.ingestion import IngestionBatch

router = APIRouter()

@router.post("/upload/{domain_type}")
async def upload_domain_data(
    domain_type: str, 
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    dataset_month: date = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user) 
):
    """
    Uploads a CSV dataset, validates the schema, initiates an ingestion batch record,
    and enqueues processing securely using a protected background worker.
    """
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are supported.")
    
    await validate_csv_headers(file, domain_type)
    await file.seek(0)
    
    # 1. Ensure our Test Client exists for this Tenant
    client = db.query(Client).filter(Client.client_code == "TEST_CLIENT").first()
    if not client:
        client = Client(
            tenant_id=current_user.tenant_id, 
            client_name="Test Client", 
            client_code="TEST_CLIENT", 
            domain_type=domain_type
        )
        db.add(client)
        db.commit()
        db.refresh(client)

    # 2. Ensure our Campaign exists
    campaign = db.query(Campaign).filter(Campaign.name == "Test Campaign", Campaign.campaign_domain == domain_type).first()
    if not campaign:
        campaign = Campaign(
            tenant_id=current_user.tenant_id, 
            client_id=client.id, 
            name="Test Campaign", 
            campaign_domain=domain_type, 
            start_date=dataset_month, 
            created_by=current_user.id
        )
        db.add(campaign)
        db.commit()
        db.refresh(campaign)

    # 3. Stream UploadFile into a temporary file on Disk (to free RAM)
    fd, temp_path = tempfile.mkstemp(suffix='.csv')
    os.close(fd)
    with open(temp_path, 'wb') as out_file:
        shutil.copyfileobj(file.file, out_file)
    
    # 4. Generate the "Processing" Batch record
    batch = IngestionBatch(
        tenant_id=current_user.tenant_id, 
        client_id=client.id, 
        campaign_id=campaign.id, 
        name=file.filename, 
        dataset_month=dataset_month, 
        created_by=current_user.id,
        status='processing'
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)
    
    # 5. Hand the temporary file OFF to the chunking background task
    background_tasks.add_task(
        process_and_load_csv_async,
        file_path=temp_path,
        domain_type=domain_type,
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        dataset_month=dataset_month,
        batch_id=batch.id
    )
    
    # 6. Respond immediately to completely unlock the user's browser!
    return {
        "message": f"Successfully queued {file.filename} for processing in the {dataset_month.strftime('%B %Y')} bucket.",
        "batch_id": batch.id,
        "domain": domain_type,
        "dataset_month": dataset_month,
        "status": "processing"
    }