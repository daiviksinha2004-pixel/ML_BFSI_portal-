import pandas as pd
import io
import uuid
from datetime import date
from sqlalchemy.orm import Session
from fastapi import UploadFile, HTTPException

from app.models.insurance import LifeCampaignRecord
from app.models.collections import CollectionRecord
from app.models.platform import Client, Campaign
from app.models.ingestion import IngestionBatch

def clean_currency(value):
    if pd.isna(value) or value is None or str(value).strip() == "": return 0.0
    if isinstance(value, str):
        try: return float(value.replace(',', '').strip())
        except ValueError: return 0.0
    return float(value)

def parse_date(date_str):
    """
    EDA Date Parser: Safely converts random CSV date formats into standard DB dates.
    Using format='mixed' allows Pandas to figure out the format automatically.
    """
    if pd.isna(date_str) or str(date_str).strip() == "": return None
    try: 
        return pd.to_datetime(date_str, format='mixed', dayfirst=True).date()
    except: 
        return None

def parse_boolean(val):
    """Robustly catches True/False from various CSV formats so it doesn't default to False."""
    if pd.isna(val) or val is None: return False
    val_str = str(val).strip().lower()
    # Handle standard true indicators, plus decimal representations like "1.0"
    return val_str in ["1", "1.0", "true", "yes", "y", "t", "active"]

def safe_str(val, default=""):
    """Ensures empty CSV cells are inserted as empty strings ('') instead of NULL."""
    if pd.isna(val) or val is None: return default
    return str(val).strip()

def safe_int(val, default=None):
    """Safely converts strings to integers, bypassing decimal string errors."""
    if pd.isna(val) or val is None or str(val).strip() == "": return default
    try: return int(float(str(val).strip()))
    except ValueError: return default


async def process_and_load_csv(
    file: UploadFile, domain_type: str, db: Session, tenant_id: uuid.UUID, user_id: uuid.UUID, dataset_month: date
) -> int:
    
    contents = await file.read()
    try:
        decoded_content = contents.decode('utf-8')
    except UnicodeDecodeError:
        decoded_content = contents.decode('latin1')
        
    df = pd.read_csv(io.StringIO(decoded_content), dtype=str)
    
    # CRITICAL FIX: Replace spaces with underscores in CSV headers! 
    df.columns = [col.strip().lower().replace(' ', '_') for col in df.columns]
    
    client = db.query(Client).filter(Client.client_code == "TEST_CLIENT").first()
    if not client:
        client = Client(tenant_id=tenant_id, client_name="Test Client", client_code="TEST_CLIENT", domain_type=domain_type)
        db.add(client)
        db.commit()

    campaign = db.query(Campaign).filter(Campaign.name == "Test Campaign").first()
    if not campaign:
        campaign = Campaign(tenant_id=tenant_id, client_id=client.id, name="Test Campaign", campaign_domain=domain_type, start_date=dataset_month, created_by=user_id)
        db.add(campaign)
        db.commit()

    batch = IngestionBatch(tenant_id=tenant_id, client_id=client.id, campaign_id=campaign.id, name=file.filename, dataset_month=dataset_month, created_by=user_id)
    db.add(batch)
    db.commit()
    
    records_to_insert = []
    
    if domain_type == "life_insurance":
        for _, row in df.iterrows():
            record = {
                # --- Keys & System Data ---
                "id": uuid.uuid4(), 
                "tenant_id": tenant_id, 
                "client_id": client.id, 
                "campaign_id": campaign.id, 
                "batch_id": batch.id,
                "dataset_month": dataset_month, 
                "lot_date": date.today(),
                
                # --- Identifiers ---
                "policy_no": safe_str(row.get("policy", row.get("policy_no")), default="UNKNOWN"), 
                "cust_id": safe_str(row.get("cust_id")),
                "agent_code": safe_str(row.get("agent_code")),
                
                # --- Auto-Formatting Dates (EDA Style) ---
                "policy_issue_date": parse_date(row.get("policy_issue_date")),
                "paid_to_date": parse_date(row.get("paid_to_date")),
                "policy_lapse_date": parse_date(row.get("policy_lapse_date")),
                "max_ri_date": parse_date(row.get("max_ri_date")),
                "quotation_valid_upto_date": parse_date(row.get("quotation_valid_upto_date")),
                
                # --- Policy Attributes ---
                "policy_status": safe_str(row.get("policy_status")),
                "policy_paying_frequency": safe_int(row.get("policy_paying_frequency")),
                "policy_paying_term": safe_int(row.get("policy_paying_term")),
                "policy_year": safe_str(row.get("policy_year")),
                
                # --- Financials ---
                "outstanding_premium": clean_currency(row.get("outstanding_premium")),
                "modal_premium": clean_currency(row.get("modal_premium")),
                "annual_premium": clean_currency(row.get("annual_premium")),
                "act_premium": clean_currency(row.get("act_premium")),
                "amount_in_suspence": clean_currency(row.get("amount_in_suspence")),
                "interest_charged": clean_currency(row.get("interest_charged")),
                
                # --- Geography (No longer NULL) ---
                "city": safe_str(row.get("city")),
                "state": safe_str(row.get("state")),
                "pin_code": safe_str(row.get("pin_code")),
                "zone": safe_str(row.get("zone")),
                
                # --- Product & Agent Data ---
                "product_type": safe_str(row.get("product_type")),
                "product_name_raw": safe_str(row.get("product_name_raw")),
                "channel": safe_str(row.get("channel")),
                "branch_name": safe_str(row.get("branch_name")),
                
                # --- Analytics ---
                "propensity_band": safe_str(row.get("propensity", row.get("propensity_band"))), 
                
                # --- Target Flag ---
                "pmt_flag": parse_boolean(row.get("pmt_flag", row.get("pmt_status"))),
            }
            records_to_insert.append(record)
            
        db.bulk_insert_mappings(LifeCampaignRecord, records_to_insert)
        
    elif domain_type == "debt_collection":
        for _, row in df.iterrows():
            record = {
                # --- Keys & System Data ---
                "id": uuid.uuid4(),
                "tenant_id": tenant_id,
                "client_id": client.id,     
                "campaign_id": campaign.id, 
                "batch_id": batch.id,       
                "dataset_month": dataset_month, 
                "lot_date": date.today(),
                
                # --- Identifiers & Demographics ---
                "loan_number": safe_str(row.get("loan_number"), default="UNKNOWN"),
                "cust_id": safe_str(row.get("cust_id")),
                "customer_occupation": safe_str(row.get("customer_occupation")),
                "state": safe_str(row.get("state")),
                "res_pin_code": safe_str(row.get("res_pin_code")),
                
                # --- Financials ---
                "loan_amount": clean_currency(row.get("loan_amount")),
                "total_pos": clean_currency(row.get("total_pos")),
                "emi_amount": clean_currency(row.get("emi_amount")),
                "dpd": safe_int(row.get("dpd"), default=0), 
                "bounce_charge": clean_currency(row.get("bounce_charge")), 
                
                # --- Product & Analytics ---
                "bucket": safe_str(row.get("bucket", "0")),
                "product_type": safe_str(row.get("product_type")),
                "vehicle_name": safe_str(row.get("vehicle_name")),
                "flag1": safe_str(row.get("flag1")),
                "propensity": safe_str(row.get("propensity")),
                
                # --- Dates ---
                "paid_to_date": parse_date(row.get("paid_to_date")),
                "loan_disbursal_date": parse_date(row.get("loan_disbursal_date")),
                "last_payment_date": parse_date(row.get("last_payment_date")),        
            }
            records_to_insert.append(record)
            
        db.bulk_insert_mappings(CollectionRecord, records_to_insert)
        
    # --- CRITICAL FIX: Commit and Return ---
    db.commit()
    return len(records_to_insert)