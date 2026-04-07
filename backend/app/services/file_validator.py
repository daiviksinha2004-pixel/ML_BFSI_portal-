import csv
from typing import List
from fastapi import UploadFile, HTTPException

# These are the mandatory columns based on the datasets you provided earlier
EXPECTED_HEADERS = {
    "life_insurance": [
        "POLICY", "CUST_ID", "CLIENT_ID", "POLICY_STATUS", 
        "OUTSTANDING_PREMIUM", "PROPENSITY", "PMT_FLAG"
    ],
    "health_insurance": [
        "POLICY", "CUST_ID", "CLIENT_ID", "POLICY_STATUS", 
        "OUTSTANDING_PREMIUM", "PROPENSITY", "PMT_FLAG"
    ],
    "debt_collection": [
        "LOAN_NUMBER", "CUST_ID", "CLIENT_ID", "EMI_AMOUNT", 
        "DPD", "BUCKET", "TOTAL_POS", "BOUNCE_CHARGE"
    ]
}

async def validate_csv_headers(file: UploadFile, domain_type: str) -> bool:
    """
    Reads the headers of an uploaded CSV and ensures they match the target domain.
    """
    if domain_type not in EXPECTED_HEADERS:
        raise HTTPException(status_code=400, detail=f"Invalid domain type: {domain_type}")
    
    expected_cols = EXPECTED_HEADERS[domain_type]
    
    # Read just the first line (headers) without loading the whole massive file into memory
    header_line = await file.read(1024) 
    await file.seek(0) # Reset the file pointer so it can be read again later
    
    # Decode and parse the header line
    headers = header_line.decode('utf-8').splitlines()[0].split(',')
    # Clean up any whitespace or quotes
    headers = [h.strip().strip('"') for h in headers]
    
    # Check if all expected columns are present in the uploaded file
    missing_cols = [col for col in expected_cols if col not in headers]
    
    if missing_cols:
        raise HTTPException(
            status_code=400, 
            detail=f"Schema mismatch for {domain_type}. Missing required columns: {missing_cols}"
        )
        
    return True