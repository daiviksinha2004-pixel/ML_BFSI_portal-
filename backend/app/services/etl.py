import os
import io
import uuid
import pandas as pd
from datetime import date
from fastapi import UploadFile, HTTPException
from app.db.session import SessionLocal

from app.models.insurance import LifeCampaignRecord
from app.models.collections import CollectionRecord
from app.models.platform import Client, Campaign
from app.models.ingestion import IngestionBatch

def clean_currency(value, default=0.0):
    if pd.isna(value) or value is None: return default
    val_str = str(value).strip().lower()
    if val_str in ["", "nan", "null", "none", "na"]: return default
    val_str_clean = ''.join(c for c in val_str if c.isdigit() or c in '.-')
    if not val_str_clean: return default
    try: return float(val_str_clean)
    except ValueError: return default

def parse_date(date_str, default=date(1970, 1, 1)):
    if pd.isna(date_str) or date_str is None: return default
    val_str = str(date_str).strip().lower()
    if val_str in ["", "nan", "null", "none", "na"]: return default
    try:
        parsed = pd.to_datetime(val_str)
        if pd.isna(parsed): return default
        return parsed.date()
    except Exception:
        try:
            parsed = pd.to_datetime(val_str, format='mixed', dayfirst=True)
            if pd.isna(parsed): return default
            return parsed.date()
        except Exception:
            return default

def parse_boolean(val):
    if pd.isna(val) or val is None: return False
    val_str = str(val).strip().lower()
    return val_str in ["1", "1.0", "true", "yes", "y", "t", "active"]

def safe_str(val, default=""):
    if pd.isna(val) or val is None: return default
    val_str = str(val).strip()
    if val_str.lower() in ["nan", "null", "none", "na"]: return default
    return val_str

def safe_int(val, default=0):
    if pd.isna(val) or val is None: return default
    val_str = str(val).strip().lower()
    if val_str in ["", "nan", "null", "none", "na"]: return default
    try: return int(float(val_str))
    except (ValueError, TypeError): return default

def process_and_load_csv_async(
    file_path: str, domain_type: str, tenant_id: uuid.UUID, user_id: uuid.UUID, dataset_month: date, batch_id: uuid.UUID
):
    """
    Background Task: 
    1. Opens a fresh DB session limit memory.
    2. Reads target file_path with Pandas iterating in 1,000 row chunks.
    3. Persists it securely matching the Tenant.
    """
    db = SessionLocal()
    try:
        batch = db.query(IngestionBatch).filter(IngestionBatch.id == batch_id).first()
        if not batch:
            return

        total_inserted = 0
        
        for chunk_df in pd.read_csv(file_path, dtype=str, chunksize=10000, encoding_errors='replace'):
            chunk_df.columns = [col.strip().lower().replace(' ', '_') for col in chunk_df.columns]
            records_to_insert = []
            
            if domain_type == "life_insurance":
                for _, row in chunk_df.iterrows():
                    record = {
                        "id": uuid.uuid4(), 
                        "tenant_id": tenant_id, 
                        "client_id": batch.client_id, 
                        "campaign_id": batch.campaign_id, 
                        "batch_id": batch.id,
                        "dataset_month": dataset_month, 
                        "lot_date": date.today(),
                        # ── Policy identifiers ──────────────────────────
                        "policy_no": safe_str(row.get("policy", row.get("policy_no")), default="UNKNOWN"), 
                        "cust_id": safe_str(row.get("cust_id")),
                        "agent_code": safe_str(row.get("agent_code")),
                        # ── Policy master attributes ────────────────────
                        "policy_issue_date": parse_date(row.get("policy_issue_date")),
                        "paid_to_date": parse_date(row.get("paid_to_date")),
                        "policy_lapse_date": parse_date(row.get("policy_lapse_date")),
                        "max_ri_date": parse_date(row.get("max_ri_date")),
                        "quotation_valid_upto_date": parse_date(row.get("quotation_valid_upto_date")),
                        "policy_status": safe_str(row.get("policy_status")),
                        "policy_paying_frequency": safe_int(row.get("policy_paying_frequency")),
                        "policy_paying_term": safe_int(row.get("policy_paying_term")),
                        "policy_year": safe_str(row.get("policy_year")),
                        "policy_source_code": safe_str(row.get("policy_source_code")),
                        # ── Product attributes ──────────────────────────
                        "product_type": safe_str(row.get("product_type")),
                        "product_name_raw": safe_str(row.get("product_name_raw")),
                        "product_code": safe_str(row.get("product_code")),
                        "product_category_raw": safe_str(row.get("product_category_raw")),
                        "productgroup": safe_str(row.get("productgroup", row.get("product_group"))),
                        # ── Premium financials ──────────────────────────
                        "outstanding_premium": clean_currency(row.get("outstanding_premium")),
                        "modal_premium": clean_currency(row.get("modal_premium")),
                        "annual_premium": clean_currency(row.get("annual_premium")),
                        "act_premium": clean_currency(row.get("act_premium")),
                        "amount_in_suspence": clean_currency(row.get("amount_in_suspence")),
                        "interest_charged": clean_currency(row.get("interest_charged")),
                        # ── Ageing & lapse analytics ────────────────────
                        "policy_ageing": safe_int(row.get("policy_ageing", row.get("policy_aging"))),
                        "lapse_ageing": safe_int(row.get("lapse_ageing", row.get("lapse_aging"))),
                        "policy_ageing_band": safe_str(row.get("policy_ageing_band", row.get("policy_aging_band"))),
                        # ── Propensity & campaign bucketing ─────────────
                        "propensity": safe_str(row.get("propensity")),
                        "propensity_band": safe_str(row.get("propensity_band")),
                        "ptd_slab": safe_str(row.get("ptd_slab")),
                        "client_bucket": safe_str(row.get("client_bucket")),
                        "priority_bucket": safe_str(row.get("priority_bucket")),
                        "sub_campaign_name": safe_str(row.get("sub_campaign_name")),
                        "campaign_type_code": safe_str(row.get("campaign_type_code")),
                        # ── Agent / distribution channel ────────────────
                        "agent_status": safe_str(row.get("agent_status")),
                        "channel": safe_str(row.get("channel")),
                        "source_agency_name": safe_str(row.get("source_agency_name")),
                        "payment_mode": safe_str(row.get("payment_mode")),
                        "branch_code": safe_str(row.get("branch_code")),
                        "branch_name": safe_str(row.get("branch_name")),
                        # ── Geography ───────────────────────────────────
                        "city": safe_str(row.get("city")),
                        "state": safe_str(row.get("state")),
                        "pin_code": safe_str(row.get("pin_code")),
                        "zone": safe_str(row.get("zone")),
                        "preferred_language": safe_str(row.get("preferred_language")),
                        # ── Conversion signal ───────────────────────────
                        "pmt_flag": parse_boolean(row.get("pmt_flag", row.get("pmt_status"))),
                    }
                    records_to_insert.append(record)
                db.bulk_insert_mappings(LifeCampaignRecord, records_to_insert)
                
            elif domain_type == "debt_collection":
                for _, row in chunk_df.iterrows():
                    # Map total_pos to its specific column(s)
                    total_pos_value = clean_currency(
                        row.get("total_pos") or
                        row.get("total_outstanding")
                    )
                    
                    # Map outstanding_premium to its specific column(s)
                    outstanding_premium_value = clean_currency(
                        row.get("outstanding_premium") or
                        row.get("outstanding")
                    )
                    
                    record = {
                        "id": uuid.uuid4(),
                        "tenant_id": tenant_id,
                        "client_id": batch.client_id,
                        "campaign_id": batch.campaign_id,
                        "batch_id": batch.id,
                        "dataset_month": dataset_month,
                        "lot_date": date.today(),
                        "loan_number": safe_str(row.get("loan_number"), default="UNKNOWN"),
                        "cust_id": safe_str(row.get("cust_id")),
                        "customer_occupation": safe_str(row.get("customer_occupation")),
                        "state": safe_str(row.get("state")),
                        "res_pin_code": safe_str(row.get("res_pin_code")),
                        "loan_amount": clean_currency(row.get("loan_amount")),
                        "total_pos": total_pos_value,
                        "outstanding_premium": outstanding_premium_value,
                        "emi_amount": clean_currency(row.get("emi_amount")),
                        "emi_os": clean_currency(row.get("emi_os") or row.get("emi_outstanding")),
                        "dpd": safe_int(row.get("dpd"), default=0),
                        "bounce_charge": clean_currency(row.get("bounce_charge")),
                        "bucket": safe_str(row.get("bucket", "0")),
                        "product_type": safe_str(row.get("product_type")),
                        "vehicle_name": safe_str(row.get("vehicle_name")),
                        "flag1": safe_str(row.get("flag1")),
                        "pmt_flag": parse_boolean(row.get("pmt_flag", row.get("pmt_status"))),
                        "propensity": safe_str(row.get("propensity")),
                        "propensity_band": safe_str(row.get("propensity_band")),
                        # Intentionally NOT propagating leaking propensity scores!
                        "paid_to_date": parse_date(row.get("paid_to_date")),
                        "loan_disbursal_date": parse_date(row.get("loan_disbursal_date")),
                        "last_payment_date": parse_date(row.get("last_payment_date")),
                    }
                    records_to_insert.append(record)
                db.bulk_insert_mappings(CollectionRecord, records_to_insert)

            # Commit current chunk
            db.commit()
            total_inserted += len(records_to_insert)
            batch.processed_records = total_inserted
            db.commit()

        # Mark finished
        batch.status = 'completed'
        batch.total_records = total_inserted
        db.commit()

    except Exception as e:
        db.rollback()
        batch = db.query(IngestionBatch).filter(IngestionBatch.id == batch_id).first()
        if batch:
            batch.status = 'failed'
            db.commit()
    finally:
        db.close()
        if os.path.exists(file_path):
            os.remove(file_path)