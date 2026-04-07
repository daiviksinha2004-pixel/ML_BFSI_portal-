-- =============================================================
-- ATS_CRP Enterprise — Multi-Domain BFSI Analytics Platform
-- PostgreSQL 16 | Partitioned | RLS-enabled | Multi-tenant
--
-- Architecture:
--   Layer 0: Auth / Platform  (tenants, users, tokens)
--   Layer 1: Core             (clients, campaigns, ingestion, uploads)
--   Layer 2: Domain Facts     (life_campaign_records | health_retention_records | collection_records)
--   Layer 3: Analytics        (metrics, predictions, model monitoring)
--
-- Revision history:
--   v1  — initial scaffold
--   v2  — multi-domain redesign (life / health / collections)
--   v3  — full life-insurance column set from 4-month ABSLI data audit;
--          propensity_band replaces propensity_score (categorical not numeric);
--          customers table de-partitioned (UUID RANGE partition unsound);
--          interactions.channel widened to VARCHAR(100);
--          health/collection stubs preserved, will be extended on first real dataset
-- =============================================================

-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- CREATE SCHEMA IF NOT EXISTS atsdbwh;

-- =============================================================
-- LAYER 0: AUTH / PLATFORM
-- =============================================================

CREATE TABLE IF NOT EXISTS tenants (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    code          VARCHAR(32)  NOT NULL UNIQUE,
    name          VARCHAR(255) NOT NULL,
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    contact_email VARCHAR(255),
    max_users     INTEGER      NOT NULL DEFAULT 50,
    metadata      JSONB,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID         NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    email         VARCHAR(255) NOT NULL,
    password_hash TEXT         NOT NULL,
    full_name     VARCHAR(255) NOT NULL,
    role          VARCHAR(64)  NOT NULL CHECK (role IN (
                    'superadmin','tenant_admin','campaign_manager',
                    'agent','analyst','readonly')),
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    failed_logins INTEGER      NOT NULL DEFAULT 0,
    locked_until  TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, email)
);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_email  ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role   ON users(tenant_id, role);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_tenant_isolation ON users
    USING (tenant_id::TEXT = current_setting('app.current_tenant_id', TRUE)
           OR current_setting('app.bypass_rls', TRUE) = 'true');

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    jti        VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked    BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rt_jti    ON refresh_tokens(jti);
CREATE INDEX IF NOT EXISTS idx_rt_user   ON refresh_tokens(user_id);

-- =============================================================
-- LAYER 1: CORE PLATFORM
-- =============================================================

-- Clients = BFSI companies (ABSLI, HDFC Life, Star Health, etc.)
-- One tenant (the BPO/analytics firm) serves multiple BFSI clients.
CREATE TABLE IF NOT EXISTS clients (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID         NOT NULL REFERENCES tenants(id),
    client_name   VARCHAR(200) NOT NULL,
    client_code   VARCHAR(50)  NOT NULL,   -- short identifier e.g. 'BSLI', 'HDFC'
    domain_type   VARCHAR(50)  NOT NULL CHECK (domain_type IN (
                    'life_insurance', 'health_insurance', 'debt_collection', 'nbfc')),
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    contact_email VARCHAR(255),
    metadata      JSONB,                   -- any extra client-specific config
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, client_code)
);
CREATE INDEX IF NOT EXISTS idx_clients_tenant ON clients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_clients_domain ON clients(tenant_id, domain_type);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY clients_tenant_isolation ON clients
    USING (tenant_id::TEXT = current_setting('app.current_tenant_id', TRUE)
           OR current_setting('app.bypass_rls', TRUE) = 'true');

-- Campaigns — campaign_domain determines which fact table receives data.
CREATE TABLE IF NOT EXISTS campaigns (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID         NOT NULL REFERENCES tenants(id),
    client_id       UUID         NOT NULL REFERENCES clients(id),
    name            VARCHAR(255) NOT NULL,
    campaign_domain VARCHAR(50)  NOT NULL CHECK (campaign_domain IN (
                      'life_retention', 'health_retention', 'debt_collection')),
    campaign_type   VARCHAR(100),          -- freeform: 'lapse_revival', 'renewal' etc.
    start_date      DATE         NOT NULL,
    end_date        DATE,
    target_amount   NUMERIC(18,2),
    status          VARCHAR(32)  NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','paused','completed','archived')),
    metadata        JSONB,
    created_by      UUID         NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_campaigns_tenant  ON campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_client  ON campaigns(client_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_domain  ON campaigns(tenant_id, campaign_domain);
CREATE INDEX IF NOT EXISTS idx_campaigns_status  ON campaigns(tenant_id, status);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY campaigns_tenant_isolation ON campaigns
    USING (tenant_id::TEXT = current_setting('app.current_tenant_id', TRUE)
           OR current_setting('app.bypass_rls', TRUE) = 'true');

-- Ingestion batches — one batch = one monthly allocation file drop.
CREATE TABLE IF NOT EXISTS ingestion_batches (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID         NOT NULL REFERENCES tenants(id),
    client_id         UUID         NOT NULL REFERENCES clients(id),
    campaign_id       UUID         NOT NULL REFERENCES campaigns(id),
    name              VARCHAR(255) NOT NULL,
    description       TEXT,
    -- First day of the primary allocation month (e.g. 2025-11-01).
    -- Note: each file may contain rows with historical LOT_DATEs;
    -- dataset_month reflects the batch's nominal period, not each row's LOT_DATE.
    dataset_month     DATE         NOT NULL,
    status            VARCHAR(32)  NOT NULL DEFAULT 'pending'
                      CHECK (status IN (
                        'pending','processing','completed','failed','partially_failed')),
    total_records     INTEGER      NOT NULL DEFAULT 0,
    processed_records INTEGER      NOT NULL DEFAULT 0,
    error_count       INTEGER      NOT NULL DEFAULT 0,
    created_by        UUID         NOT NULL REFERENCES users(id),
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_batches_tenant   ON ingestion_batches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_batches_campaign ON ingestion_batches(campaign_id);
CREATE INDEX IF NOT EXISTS idx_batches_month    ON ingestion_batches(tenant_id, dataset_month);

ALTER TABLE ingestion_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY batches_tenant_isolation ON ingestion_batches
    USING (tenant_id::TEXT = current_setting('app.current_tenant_id', TRUE)
           OR current_setting('app.bypass_rls', TRUE) = 'true');

-- Uploads — one batch can have multiple file uploads (chunked delivery etc.)
CREATE TABLE IF NOT EXISTS uploads (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id          UUID         NOT NULL REFERENCES ingestion_batches(id),
    tenant_id         UUID         NOT NULL REFERENCES tenants(id),
    original_filename VARCHAR(512) NOT NULL,
    minio_key         TEXT         NOT NULL UNIQUE,
    sha256_checksum   CHAR(64)     NOT NULL,
    file_size_bytes   BIGINT       NOT NULL,
    mime_type         VARCHAR(128),
    status            VARCHAR(32)  NOT NULL DEFAULT 'queued'
                      CHECK (status IN (
                        'queued','parsing','validating','loading',
                        'done','failed','partially_failed')),
    row_count         INTEGER,
    error_count       INTEGER      NOT NULL DEFAULT 0,
    error_summary     JSONB,
    reconcile_needed  BOOLEAN      NOT NULL DEFAULT FALSE,
    uploaded_by       UUID         NOT NULL REFERENCES users(id),
    completed_at      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (batch_id, sha256_checksum)  -- prevent duplicate file re-upload
);
CREATE INDEX IF NOT EXISTS idx_uploads_batch  ON uploads(batch_id);
CREATE INDEX IF NOT EXISTS idx_uploads_tenant ON uploads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_uploads_status ON uploads(status);

ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY uploads_tenant_isolation ON uploads
    USING (tenant_id::TEXT = current_setting('app.current_tenant_id', TRUE)
           OR current_setting('app.bypass_rls', TRUE) = 'true');

-- Customers — shared entity across all domains.
-- Plain table (not partitioned): UUID RANGE partition is unsound.
-- High-volume clients can add HASH partitioning as a migration step later.
CREATE TABLE IF NOT EXISTS customers (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID         NOT NULL REFERENCES tenants(id),
    client_id    UUID         NOT NULL REFERENCES clients(id),
    external_ref VARCHAR(128) NOT NULL,   -- client's own customer / policyholder ID
    full_name    VARCHAR(255),
    mobile       VARCHAR(20),
    email        VARCHAR(255),
    city         VARCHAR(100),
    state        VARCHAR(100),
    pin_code     VARCHAR(10),
    zone         VARCHAR(50),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, client_id, external_ref)
);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_client ON customers(tenant_id, client_id);
CREATE INDEX IF NOT EXISTS idx_customers_ref           ON customers(tenant_id, external_ref);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY customers_tenant_isolation ON customers
    USING (tenant_id::TEXT = current_setting('app.current_tenant_id', TRUE)
           OR current_setting('app.bypass_rls', TRUE) = 'true');


-- =============================================================
-- LAYER 2A: LIFE INSURANCE — CAMPAIGN FACT TABLE
--
-- Designed from 4-month ABSLI allocation data audit (Nov-25 → Feb-26).
-- Every column from the source files is mapped here or captured in raw_data.
-- Other life insurance clients (HDFC Life etc.) share the same schema;
-- client-specific extra fields go into raw_data JSONB.
--
-- Partitioned by lot_date month (the row's actual allocation date),
-- NOT by dataset_month, so historical rows land in their correct partitions.
-- =============================================================

CREATE TABLE IF NOT EXISTS life_campaign_records (
    -- ── Identity ──────────────────────────────────────────────
    id                        UUID          NOT NULL DEFAULT gen_random_uuid(),
    tenant_id                 UUID          NOT NULL,
    client_id                 UUID          NOT NULL,
    campaign_id               UUID          NOT NULL,
    batch_id                  UUID          NOT NULL,

    -- ── Policy identifiers ────────────────────────────────────
    -- policy_no: ABSLI's policy number (source col: POLICY)
    policy_no                 VARCHAR(20)   NOT NULL,
    -- cust_id: ABSLI's policyholder/customer ID (source col: CUST_ID)
    cust_id                   VARCHAR(15),
    -- agent_code: intermediary who sold the policy (source col: CLIENT_ID — misnamed in source)
    agent_code                VARCHAR(15),

    -- ── Policy master attributes ──────────────────────────────
    policy_status             VARCHAR(20),   -- Lapse / Paid up / Due / Discontinue
    policy_issue_date         DATE,
    paid_to_date              DATE,
    policy_lapse_date         DATE,
    max_ri_date               DATE,          -- reinstatement deadline
    quotation_valid_upto_date DATE,
    policy_paying_frequency   SMALLINT,      -- 1=yearly 3=quarterly 6=half-yearly 12=monthly
    policy_paying_term        SMALLINT,      -- 0 means single premium
    -- policy_year: textual year-in-force label (source: 'SECOND YEAR', 'FOURTH YEAR' etc.)
    policy_year               VARCHAR(30),
    policy_source_code        VARCHAR(20),   -- ABSLI internal distribution code

    -- ── Product attributes ────────────────────────────────────
    product_type              VARCHAR(30),   -- Traditional / ULIP
    -- product_name_raw: Nov file has full name; Dec+ sends numeric code in same column
    product_name_raw          VARCHAR(200),
    -- product_code: ABSLI's internal product code (source col: PRODUCT_CODE)
    product_code              VARCHAR(10),
    -- product_category: Nov = string label, Dec+ = integer code — store as-is
    product_category_raw      VARCHAR(100),
    productgroup              VARCHAR(5),    -- single-char product group (A/B/C...)

    -- ── Premium financials ────────────────────────────────────
    outstanding_premium       NUMERIC(18,2), -- THE key recovery metric; nullable (Jan nulls on Paid up)
    modal_premium             NUMERIC(18,2),
    annual_premium            NUMERIC(18,2),
    act_premium               NUMERIC(18,2), -- actual/effective premium
    amount_in_suspence        NUMERIC(18,2), -- can be negative (advance payments)
    interest_charged          NUMERIC(18,2),

    -- ── Ageing & lapse analytics ─────────────────────────────
    -- policy_ageing: days since policy inception (always >= 0)
    policy_ageing             INTEGER,
    -- lapse_ageing: days since lapse (negative = pre-lapse / in grace)
    lapse_ageing              INTEGER,
    -- policy_ageing_band: normalised canonical value
    -- Source has 19 variants across files; loader normalises to: 13M/25M/37M/49M/61M/FYRP/OTHERS
    policy_ageing_band        VARCHAR(10),

    -- ── Propensity & campaign bucketing ──────────────────────
    -- propensity_band: categorical bucket from ABSLI's model
    -- Values: A.HIGH / B.MEDIUM / C.LOW / GT5L / NEW POLICY
    -- Nov file has no propensity data (null); Dec onward is populated.
    -- Was incorrectly typed as NUMERIC in v1/v2 — corrected here.
    propensity_band           VARCHAR(20),
    -- ptd_slab: premium-to-date slab (normalised); source has 26 variants
    -- Canonical values: GRT365 / 180-365 / 90-180 / 60-90 / 30-60 / 0-30 / GRACE / DUE
    ptd_slab                  VARCHAR(15),
    -- client_bucket: ABSLI's lapse bucket (L1/L2/L3/L4/Due/Grace)
    -- Nov had 26% null; Dec had 41.5% null (structural — unassigned deep lapse cohort)
    client_bucket             VARCHAR(20),
    -- priority_bucket: ABSLI's campaign priority override (source col: BUCKET)
    -- Mostly empty (Nov/Jan/Feb near-100% null); Feb introduced 'Focus Bucket'
    priority_bucket           VARCHAR(50),
    sub_campaign_name         VARCHAR(30),   -- Deep Lapse / Lower Ageing / Dues/Grace
    campaign_type_code        VARCHAR(20),   -- always 'RETENTION' in current data

    -- ── Agent / distribution channel ─────────────────────────
    agent_status              VARCHAR(15),   -- normalised: ACTIVE/INACTIVE/TERMINATED/EXITED/UNKNOWN
    channel                   VARCHAR(50),   -- Agency / HDFC Bank / Banca / DM / DSF Main etc.
    source_agency_name        VARCHAR(30),
    payment_mode              VARCHAR(5),    -- single char or short code
    branch_code               VARCHAR(15),
    branch_name               VARCHAR(50),

    -- ── Geography ─────────────────────────────────────────────
    city                      VARCHAR(50),
    state                     VARCHAR(50),
    pin_code                  VARCHAR(10),
    zone                      VARCHAR(30),   -- 52–62% null across files — don't require NOT NULL
    preferred_language        VARCHAR(20),

    -- ── Conversion signal ─────────────────────────────────────
    -- pmt_flag: TRUE = premium payment confirmed this allocation cycle
    -- Nov had only 22 cases; Feb has 1,906 — strong campaign signal
    pmt_flag                  BOOLEAN        NOT NULL DEFAULT FALSE,

    -- ── Temporal / batch tracking ─────────────────────────────
    -- lot_date: the row's actual allocation date from the source file (source col: LOT_DATE)
    -- Used for partitioning — each row lands in its correct month's partition.
    -- Note: historical anchor rows (2023-12, 2024-03 etc.) appear in every file.
    lot_date                  DATE           NOT NULL,
    -- dataset_month: nominal batch month (redundant for query but useful for grouping)
    dataset_month             DATE           NOT NULL,

    -- ── Raw capture ───────────────────────────────────────────
    -- raw_data: full original row stored as JSONB for audit and reprocessing.
    -- Captures cols that vary by client (PRODUCTCATEGORY, PRODUCT_NUMBER in Nov only)
    -- and any future columns added by ABSLI without requiring schema migration.
    raw_data                  JSONB,

    -- ── Derived / platform-added ─────────────────────────────
    -- months_in_campaign: set by the loader — how many allocation files this policy has appeared in.
    -- 52,249 policies appeared in all 4 files (Nov/Dec/Jan/Feb) — key ML feature.
    months_in_campaign        SMALLINT       NOT NULL DEFAULT 1,
    created_at                TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    PRIMARY KEY (id, lot_date)
) PARTITION BY RANGE (lot_date);

-- Indexes on life_campaign_records
CREATE INDEX IF NOT EXISTS idx_lcr_tenant_lot      ON life_campaign_records(tenant_id, lot_date);
CREATE INDEX IF NOT EXISTS idx_lcr_campaign_lot    ON life_campaign_records(campaign_id, lot_date);
CREATE INDEX IF NOT EXISTS idx_lcr_policy_lot      ON life_campaign_records(policy_no, lot_date);
CREATE INDEX IF NOT EXISTS idx_lcr_cust_lot        ON life_campaign_records(cust_id, lot_date);
CREATE INDEX IF NOT EXISTS idx_lcr_batch           ON life_campaign_records(batch_id);
CREATE INDEX IF NOT EXISTS idx_lcr_status_lot      ON life_campaign_records(policy_status, lot_date);
CREATE INDEX IF NOT EXISTS idx_lcr_propensity      ON life_campaign_records(propensity_band, lot_date);
CREATE INDEX IF NOT EXISTS idx_lcr_client_bucket   ON life_campaign_records(client_bucket, lot_date);
CREATE INDEX IF NOT EXISTS idx_lcr_sub_campaign    ON life_campaign_records(sub_campaign_name, lot_date);
CREATE INDEX IF NOT EXISTS idx_lcr_channel         ON life_campaign_records(channel, lot_date);
CREATE INDEX IF NOT EXISTS idx_lcr_state           ON life_campaign_records(state, lot_date);
-- Partial index for converted policies — PMT analytics
CREATE INDEX IF NOT EXISTS idx_lcr_pmt_true        ON life_campaign_records(campaign_id, lot_date)
    WHERE pmt_flag = TRUE;
-- Partial index for high propensity — agent routing
CREATE INDEX IF NOT EXISTS idx_lcr_high_prop       ON life_campaign_records(campaign_id, lot_date)
    WHERE propensity_band = 'A.HIGH';

ALTER TABLE life_campaign_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY life_records_tenant_isolation ON life_campaign_records
    USING (tenant_id::TEXT = current_setting('app.current_tenant_id', TRUE)
           OR current_setting('app.bypass_rls', TRUE) = 'true');

-- Partitions: create for current month, lookback to 2023-12 (earliest LOT_DATE seen),
-- and 3 months forward. The archival_tasks Celery job manages ongoing creation.
DO $$
DECLARE
    start_month DATE;
    end_month   DATE;
    pname       TEXT;
BEGIN
    -- Lookback: 2023-10 to cover historical anchor rows (2023-12, 2024-03 etc.)
    FOR i IN -30..3 LOOP
        start_month := DATE_TRUNC('month',
            CURRENT_DATE + (i::TEXT || ' months')::INTERVAL)::DATE;
        end_month   := (start_month + INTERVAL '1 month')::DATE;
        pname       := 'lcr_' || TO_CHAR(start_month, 'YYYY_MM');
        IF NOT EXISTS (SELECT FROM pg_tables WHERE tablename = pname) THEN
            EXECUTE format(
                'CREATE TABLE IF NOT EXISTS %I PARTITION OF life_campaign_records '
                'FOR VALUES FROM (%L) TO (%L)',
                pname, start_month, end_month
            );
        END IF;
    END LOOP;
END $$;


-- =============================================================
-- LAYER 2B: HEALTH INSURANCE — STUB
-- Schema will be built once first real dataset arrives.
-- Placeholder columns based on known BFSI health retention patterns.
-- =============================================================

CREATE TABLE IF NOT EXISTS health_retention_records (
    -- ── Identity ──────────────────────────────────────────────
    id                        UUID          NOT NULL DEFAULT gen_random_uuid(),
    tenant_id                 UUID          NOT NULL,
    client_id                 UUID          NOT NULL,
    campaign_id               UUID          NOT NULL,
    batch_id                  UUID          NOT NULL,

    -- ── Policy identifiers ────────────────────────────────────
    policy_no                 VARCHAR(20)   NOT NULL,
    cust_id                   VARCHAR(15),
    agent_code                VARCHAR(15),

    -- ── Policy master attributes ──────────────────────────────
    policy_status             VARCHAR(20),   
    policy_issue_date         DATE,
    paid_to_date              DATE,
    policy_lapse_date         DATE,
    max_ri_date               DATE,          
    quotation_valid_upto_date DATE,
    policy_paying_frequency   SMALLINT,      
    policy_paying_term        SMALLINT,      
    policy_year               VARCHAR(30),
    policy_source_code        VARCHAR(20),   

    -- ── Product attributes ────────────────────────────────────
    product_type              VARCHAR(30),   
    product_name_raw          VARCHAR(200),
    product_code              VARCHAR(10),
    product_category_raw      VARCHAR(100),
    productgroup              VARCHAR(5),    

    -- ── Premium financials ────────────────────────────────────
    outstanding_premium       NUMERIC(18,2), 
    modal_premium             NUMERIC(18,2),
    annual_premium            NUMERIC(18,2),
    act_premium               NUMERIC(18,2),
    amount_in_suspence        NUMERIC(18,2),
    interest_charged          NUMERIC(18,2),

    -- ── Ageing & lapse analytics ─────────────────────────────
    policy_ageing             INTEGER,
    lapse_ageing              INTEGER,
    policy_ageing_band        VARCHAR(10),

    -- ── Propensity & campaign bucketing ──────────────────────
    propensity_band           VARCHAR(20),
    ptd_slab                  VARCHAR(15),
    client_bucket             VARCHAR(20),
    priority_bucket           VARCHAR(50),
    sub_campaign_name         VARCHAR(30),   
    campaign_type_code        VARCHAR(20),   

    -- ── Agent / distribution channel ─────────────────────────
    agent_status              VARCHAR(15),   
    channel                   VARCHAR(50),   
    source_agency_name        VARCHAR(30),
    payment_mode              VARCHAR(5),    
    branch_code               VARCHAR(15),
    branch_name               VARCHAR(50),

    -- ── Geography ─────────────────────────────────────────────
    city                      VARCHAR(50),
    state                     VARCHAR(50),
    pin_code                  VARCHAR(10),
    zone                      VARCHAR(30),   
    preferred_language        VARCHAR(20),

    -- ── Conversion signal ─────────────────────────────────────
    pmt_flag                  BOOLEAN        NOT NULL DEFAULT FALSE,

    -- ── Temporal / batch tracking ─────────────────────────────
    lot_date                  DATE           NOT NULL,
    dataset_month             DATE           NOT NULL,

    -- ── Raw capture ───────────────────────────────────────────
    raw_data                  JSONB,

    -- ── Derived / platform-added ─────────────────────────────
    months_in_campaign        SMALLINT       NOT NULL DEFAULT 1,
    created_at                TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    PRIMARY KEY (id, lot_date)
) PARTITION BY RANGE (lot_date);

-- Indexes on health_retention_records
CREATE INDEX IF NOT EXISTS idx_hrr_tenant_lot      ON health_retention_records(tenant_id, lot_date);
CREATE INDEX IF NOT EXISTS idx_hrr_campaign_lot    ON health_retention_records(campaign_id, lot_date);
CREATE INDEX IF NOT EXISTS idx_hrr_policy_lot      ON health_retention_records(policy_no, lot_date);
CREATE INDEX IF NOT EXISTS idx_hrr_cust_lot        ON health_retention_records(cust_id, lot_date);
CREATE INDEX IF NOT EXISTS idx_hrr_batch           ON health_retention_records(batch_id);
CREATE INDEX IF NOT EXISTS idx_hrr_status_lot      ON health_retention_records(policy_status, lot_date);
CREATE INDEX IF NOT EXISTS idx_hrr_propensity      ON health_retention_records(propensity_band, lot_date);
CREATE INDEX IF NOT EXISTS idx_hrr_client_bucket   ON health_retention_records(client_bucket, lot_date);
CREATE INDEX IF NOT EXISTS idx_hrr_sub_campaign    ON health_retention_records(sub_campaign_name, lot_date);
CREATE INDEX IF NOT EXISTS idx_hrr_channel         ON health_retention_records(channel, lot_date);
CREATE INDEX IF NOT EXISTS idx_hrr_state           ON health_retention_records(state, lot_date);

ALTER TABLE health_retention_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY health_records_tenant_isolation ON health_retention_records
    USING (tenant_id::TEXT = current_setting('app.current_tenant_id', TRUE)
           OR current_setting('app.bypass_rls', TRUE) = 'true');

DO $$
DECLARE start_month DATE; end_month DATE; pname TEXT;
BEGIN
    FOR i IN 0..3 LOOP
        start_month := DATE_TRUNC('month', CURRENT_DATE + (i::TEXT || ' months')::INTERVAL)::DATE;
        end_month   := (start_month + INTERVAL '1 month')::DATE;
        pname       := 'hrr_' || TO_CHAR(start_month, 'YYYY_MM');
        IF NOT EXISTS (SELECT FROM pg_tables WHERE tablename = pname) THEN
            EXECUTE format(
                'CREATE TABLE IF NOT EXISTS %I PARTITION OF health_retention_records '
                'FOR VALUES FROM (%L) TO (%L)',
                pname, start_month, end_month
            );
        END IF;
    END LOOP;
END $$;


-- =============================================================
-- LAYER 2C: DEBT COLLECTION — STUB
-- Schema will be built once first real dataset arrives.
-- =============================================================

CREATE TABLE IF NOT EXISTS collection_records (
    -- ── Identity & Platform ──────────────────────────────────────────────
    id                        UUID          NOT NULL DEFAULT gen_random_uuid(),
    tenant_id                 UUID          NOT NULL,
    client_id                 UUID          NOT NULL,
    campaign_id               UUID          NOT NULL,
    batch_id                  UUID          NOT NULL,

    -- ── Loan / Base identifiers ─────────────────────────────
    loan_number               VARCHAR(50)   NOT NULL,
    cust_id                   VARCHAR(50),
    source_client_id          VARCHAR(50),  -- dataset "CLIENT_ID"

    -- ── Customer Demographics ───────────────────────────────
    customer_occupation       VARCHAR(100),
    state                     VARCHAR(100),
    res_pin_code              VARCHAR(20),
    gender                    VARCHAR(20),
    salutation                VARCHAR(20),
    preferred_language        VARCHAR(50),
    depositor_mobile_number   VARCHAR(20),
    ref_cust_id               VARCHAR(50),

    -- ── Financial & Dues ────────────────────────────────────
    paid_to_date              DATE,
    outstanding_premium       NUMERIC(18,2),
    loan_amount               NUMERIC(18,2),
    total_pos                 NUMERIC(18,2),
    emi_amount                NUMERIC(18,2),
    emi_os                    NUMERIC(18,2),
    lpp_due                   NUMERIC(18,2),
    bounce_charge             NUMERIC(18,2),
    total_penalty_charges     NUMERIC(18,2),
    other_dues                NUMERIC(18,2),
    total_emi_received        NUMERIC(18,2),
    last_payment_date         DATE,
    lastmonth_payment_date    DATE,
    l2lmonth_payment_date     DATE,
    l2l2lmonth_payment_date   DATE,
    lastmonth_payment_amt     NUMERIC(18,2),
    l2lmonth_payment_amt      NUMERIC(18,2),
    l2l2lmonth_payment_amt    NUMERIC(18,2),
    emi_due                   NUMERIC(18,2),
    first_emi_due_date        DATE,
    foreclosure_amount        NUMERIC(18,2),
    last_paid_date            DATE,
    min_settlement_amount     NUMERIC(18,2),
    total_pi                  NUMERIC(18,2),
    excess_money              NUMERIC(18,2),
    overdraft_amount          NUMERIC(18,2),
    due_amount                NUMERIC(18,2),
    advance_collection        NUMERIC(18,2),
    interest_amount           NUMERIC(18,2),
    penal_charge              NUMERIC(18,2),
    paid_amount               NUMERIC(18,2),
    paid_date                 DATE,

    -- ── Loan Details ────────────────────────────────────────
    loan_disbursal_date       DATE,
    loan_completed            VARCHAR(50),
    loan_tenure               INTEGER,
    loan_maturity_date        DATE,
    gross_maturity_date       DATE,
    purpose_of_loan           VARCHAR(100),
    payment_frequency         VARCHAR(50),

    -- ── Product & Vehicle ───────────────────────────────────
    product_type              VARCHAR(100),
    product_name              VARCHAR(150),
    registration_no           VARCHAR(50),
    engine_no                 VARCHAR(100),
    chassis_no                VARCHAR(100),
    vehicle_name              VARCHAR(150),
    schemeid                  VARCHAR(50),
    scheme_desc               VARCHAR(255),

    -- ── Campaign / Agency ───────────────────────────────────
    branch_code               VARCHAR(50),
    branch_name               VARCHAR(100),
    policy_source_code        VARCHAR(50),
    source_agency_name        VARCHAR(100),
    agent_name                VARCHAR(100),
    rm_name                   VARCHAR(100),
    region                    VARCHAR(50),
    zone                      VARCHAR(50),
    campaign_name             VARCHAR(100),
    sub_campaign_name         VARCHAR(100),
    campaign_type             VARCHAR(50),
    requirement               VARCHAR(100),
    special_queue             VARCHAR(100),
    decile                    VARCHAR(20),
    payment_link              VARCHAR(255),
    short_payment_link        VARCHAR(100),
    appformno                 VARCHAR(50),

    -- ── Banking / Mandates ──────────────────────────────────
    presentation_date         DATE,
    bank_name                 VARCHAR(100),
    ecs_status                VARCHAR(50),
    payment_mode              VARCHAR(50),
    last_paymentchannel       VARCHAR(100),
    lastmonth_payment_mode    VARCHAR(50),
    l2lmonth_payment_mode     VARCHAR(50),
    l2l2lmonth_payment_mode   VARCHAR(50),
    mandate_status            VARCHAR(50),
    mandate_reject_reason     VARCHAR(255),
    mandate_registration_date DATE,
    mandate_bounce_reason     VARCHAR(255),
    mandate_bounce_date       DATE,
    bounce_type               VARCHAR(50),
    bounce_count              INTEGER,
    lastmonth_bounce_status   VARCHAR(50),
    l2lmonth_bounce_status    VARCHAR(50),
    l2l2lmonth_bounce_status  VARCHAR(50),
    l2l2l2lmonth_bounce_status VARCHAR(50),
    l2l2l2l2lmonth_bounce_status VARCHAR(50),
    l2l2l2l2l2lmonth_bounce_status VARCHAR(50),
    fund_transfer_date        DATE,

    -- ── State / Bucket  ─────────────────────────────────────
    bom_bucket                VARCHAR(50),
    bucket                    VARCHAR(50),
    dpd                       INTEGER,
    policy_status             VARCHAR(50),
    delinquency_string        VARCHAR(50),
    last_month_closing_code   VARCHAR(50),
    last_month_closing_desc   VARCHAR(255),
    number_of_emi_paid        INTEGER,
    credit_score              VARCHAR(20),  
    mob_band                  VARCHAR(50),
    mob_in_month              INTEGER,
    repo                      VARCHAR(50),
    block_date                DATE,
    block_remark              VARCHAR(255),
    flag1                     VARCHAR(50),
    flag2                     VARCHAR(50),
    workable_status           VARCHAR(50),
    data_category             VARCHAR(50),
    propensity_band           VARCHAR(50),
    premium_band              VARCHAR(50),

    -- ── Internal Flow ───────────────────────────────────────
    process_date              DATE,
    lot_date                  DATE         NOT NULL,
    lot_type                  VARCHAR(50),
    cat                       VARCHAR(50),

    -- ── Conversion Signal ───────────────────────────────────
    pmt_flag                  BOOLEAN      NOT NULL DEFAULT FALSE,
    
    -- ── Temporal / batch tracking ───────────────────────────
    dataset_month             DATE         NOT NULL,
    raw_data                  JSONB,
    created_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    
    PRIMARY KEY (id, lot_date)
) PARTITION BY RANGE (lot_date);

CREATE INDEX IF NOT EXISTS idx_cr_tenant_lot  ON collection_records(tenant_id, lot_date);
CREATE INDEX IF NOT EXISTS idx_cr_campaign    ON collection_records(campaign_id, lot_date);
CREATE INDEX IF NOT EXISTS idx_cr_loan        ON collection_records(loan_number, lot_date);
CREATE INDEX IF NOT EXISTS idx_cr_bucket      ON collection_records(bucket, lot_date);

ALTER TABLE collection_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY collection_records_tenant ON collection_records
    USING (tenant_id::TEXT = current_setting('app.current_tenant_id', TRUE)
           OR current_setting('app.bypass_rls', TRUE) = 'true');

DO $$
DECLARE start_month DATE; end_month DATE; pname TEXT;
BEGIN
    FOR i IN 0..3 LOOP
        start_month := DATE_TRUNC('month', CURRENT_DATE + (i::TEXT || ' months')::INTERVAL)::DATE;
        end_month   := (start_month + INTERVAL '1 month')::DATE;
        pname       := 'cr_' || TO_CHAR(start_month, 'YYYY_MM');
        IF NOT EXISTS (SELECT FROM pg_tables WHERE tablename = pname) THEN
            EXECUTE format(
                'CREATE TABLE IF NOT EXISTS %I PARTITION OF collection_records '
                'FOR VALUES FROM (%L) TO (%L)',
                pname, start_month, end_month
            );
        END IF;
    END LOOP;
END $$;


-- =============================================================
-- LAYER 2D: INTERACTIONS (cross-domain agent touchpoints)
-- =============================================================

CREATE TABLE IF NOT EXISTS interactions (
    id               UUID         NOT NULL DEFAULT gen_random_uuid(),
    tenant_id        UUID         NOT NULL,
    client_id        UUID         NOT NULL,
    campaign_id      UUID         NOT NULL,
    -- polymorphic FK: points to a life_campaign_records / health / collection row id
    domain_record_id UUID,
    -- policy_no / loan_account_id depending on domain
    external_ref     VARCHAR(30),
    agent_id         UUID         REFERENCES users(id),
    -- channel widened to VARCHAR(100): 'BANK OF MAHARASHTRA' = 19 chars, future-proof
    channel          VARCHAR(100) NOT NULL,
    outcome          VARCHAR(64)  NOT NULL,
    ptp_date         DATE,
    ptp_amount       NUMERIC(18,2),
    notes            TEXT,
    duration_seconds INTEGER,
    occurred_at      TIMESTAMPTZ  NOT NULL,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

CREATE INDEX IF NOT EXISTS idx_int_tenant_date  ON interactions(tenant_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_int_campaign     ON interactions(campaign_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_int_ref          ON interactions(external_ref);
CREATE INDEX IF NOT EXISTS idx_int_outcome      ON interactions(outcome, occurred_at);

ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY interactions_tenant_isolation ON interactions
    USING (tenant_id::TEXT = current_setting('app.current_tenant_id', TRUE)
           OR current_setting('app.bypass_rls', TRUE) = 'true');

DO $$
DECLARE start_month DATE; end_month DATE; pname TEXT;
BEGIN
    FOR i IN 0..3 LOOP
        start_month := DATE_TRUNC('month', CURRENT_DATE + (i::TEXT || ' months')::INTERVAL)::DATE;
        end_month   := (start_month + INTERVAL '1 month')::DATE;
        pname       := 'interactions_' || TO_CHAR(start_month, 'YYYY_MM');
        IF NOT EXISTS (SELECT FROM pg_tables WHERE tablename = pname) THEN
            EXECUTE format(
                'CREATE TABLE IF NOT EXISTS %I PARTITION OF interactions '
                'FOR VALUES FROM (%L) TO (%L)',
                pname, start_month, end_month
            );
        END IF;
    END LOOP;
END $$;


-- =============================================================
-- LAYER 2E: PAYMENTS (cross-domain)
-- =============================================================

CREATE TABLE IF NOT EXISTS payments (
    id               UUID          NOT NULL DEFAULT gen_random_uuid(),
    tenant_id        UUID          NOT NULL,
    client_id        UUID          NOT NULL,
    campaign_id      UUID          NOT NULL,
    batch_id         UUID,
    external_ref     VARCHAR(30)   NOT NULL,
    amount           NUMERIC(18,2) NOT NULL CHECK (amount > 0),
    payment_date     DATE          NOT NULL,
    payment_status   VARCHAR(32)   NOT NULL DEFAULT 'confirmed'
                     CHECK (payment_status IN ('pending','confirmed','bounced','reversed')),
    payment_method   VARCHAR(64),
    reference_number VARCHAR(256),
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, payment_date)
) PARTITION BY RANGE (payment_date);

CREATE INDEX IF NOT EXISTS idx_pay_tenant    ON payments(tenant_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_pay_campaign  ON payments(campaign_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_pay_ref       ON payments(external_ref, payment_date);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY payments_tenant_isolation ON payments
    USING (tenant_id::TEXT = current_setting('app.current_tenant_id', TRUE)
           OR current_setting('app.bypass_rls', TRUE) = 'true');

DO $$
DECLARE start_month DATE; end_month DATE; pname TEXT;
BEGIN
    FOR i IN 0..3 LOOP
        start_month := DATE_TRUNC('month', CURRENT_DATE + (i::TEXT || ' months')::INTERVAL)::DATE;
        end_month   := (start_month + INTERVAL '1 month')::DATE;
        pname       := 'payments_' || TO_CHAR(start_month, 'YYYY_MM');
        IF NOT EXISTS (SELECT FROM pg_tables WHERE tablename = pname) THEN
            EXECUTE format(
                'CREATE TABLE IF NOT EXISTS %I PARTITION OF payments '
                'FOR VALUES FROM (%L) TO (%L)',
                pname, start_month, end_month
            );
        END IF;
    END LOOP;
END $$;


-- =============================================================
-- LAYER 3: ANALYTICS
-- =============================================================

-- Pre-aggregated daily metrics — fast dashboard reads, domain-agnostic.
CREATE TABLE IF NOT EXISTS campaign_daily_metrics (
    id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id         UUID          NOT NULL REFERENCES campaigns(id),
    client_id           UUID          NOT NULL REFERENCES clients(id),
    tenant_id           UUID          NOT NULL REFERENCES tenants(id),
    metric_date         DATE          NOT NULL,
    total_accounts      INTEGER       NOT NULL DEFAULT 0,
    contacted_accounts  INTEGER       NOT NULL DEFAULT 0,
    interactions_count  INTEGER       NOT NULL DEFAULT 0,
    total_outstanding   NUMERIC(18,2) NOT NULL DEFAULT 0,
    amount_collected    NUMERIC(18,2) NOT NULL DEFAULT 0,
    recovery_rate       NUMERIC(8,4),
    pmt_count           INTEGER       NOT NULL DEFAULT 0,   -- PMT_FLAG=1 count
    ptp_count           INTEGER       NOT NULL DEFAULT 0,
    ptp_kept_count      INTEGER       NOT NULL DEFAULT 0,
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (campaign_id, metric_date)
);
CREATE INDEX IF NOT EXISTS idx_cdm_tenant_date   ON campaign_daily_metrics(tenant_id, metric_date);
CREATE INDEX IF NOT EXISTS idx_cdm_campaign_date ON campaign_daily_metrics(campaign_id, metric_date);
CREATE INDEX IF NOT EXISTS idx_cdm_client_date   ON campaign_daily_metrics(client_id, metric_date);

-- Monthly campaign summaries — for trend analysis
CREATE TABLE IF NOT EXISTS campaign_monthly_metrics (
    id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id           UUID          NOT NULL REFERENCES campaigns(id),
    client_id             UUID          NOT NULL REFERENCES clients(id),
    tenant_id             UUID          NOT NULL REFERENCES tenants(id),
    metric_month          DATE          NOT NULL,   -- first day of month
    -- Portfolio summary
    total_accounts        INTEGER       NOT NULL DEFAULT 0,
    new_accounts          INTEGER       NOT NULL DEFAULT 0,   -- fresh to this month
    exited_accounts       INTEGER       NOT NULL DEFAULT 0,   -- dropped vs prior month
    -- Financials
    total_outstanding     NUMERIC(18,2) NOT NULL DEFAULT 0,
    total_annual_premium  NUMERIC(18,2) NOT NULL DEFAULT 0,
    -- Conversion
    pmt_count             INTEGER       NOT NULL DEFAULT 0,
    pmt_rate              NUMERIC(8,4),
    -- Propensity breakdown
    high_propensity_count INTEGER       NOT NULL DEFAULT 0,  -- A.HIGH
    med_propensity_count  INTEGER       NOT NULL DEFAULT 0,  -- B.MEDIUM
    low_propensity_count  INTEGER       NOT NULL DEFAULT 0,  -- C.LOW
    -- Lapse ageing
    pre_lapse_count       INTEGER       NOT NULL DEFAULT 0,  -- lapse_ageing < 0
    early_lapse_count     INTEGER       NOT NULL DEFAULT 0,  -- 0-90 days
    deep_lapse_count      INTEGER       NOT NULL DEFAULT 0,  -- >365 days
    computed_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (campaign_id, metric_month)
);
CREATE INDEX IF NOT EXISTS idx_cmm_tenant_month ON campaign_monthly_metrics(tenant_id, metric_month);
CREATE INDEX IF NOT EXISTS idx_cmm_client_month ON campaign_monthly_metrics(client_id, metric_month);

-- Model versions
CREATE TABLE IF NOT EXISTS model_versions (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID         REFERENCES tenants(id),
    version_name     VARCHAR(128) NOT NULL UNIQUE,
    algorithm        VARCHAR(128),
    domain           VARCHAR(50),  -- NULL = universal
    status           VARCHAR(32)  NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','deprecated','shadow')),
    features_list    JSONB,
    training_period  DATERANGE,
    deployed_at      TIMESTAMPTZ,
    deprecated_at    TIMESTAMPTZ,
    notes            TEXT,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Forecast predictions (train on month T, predict month T+N)
CREATE TABLE IF NOT EXISTS forecast_predictions (
    id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID          NOT NULL REFERENCES tenants(id),
    client_id        UUID          NOT NULL REFERENCES clients(id),
    campaign_id      UUID          NOT NULL REFERENCES campaigns(id),
    training_month   DATE          NOT NULL,
    target_month     DATE          NOT NULL,
    predicted_value  NUMERIC(18,2),
    model_version    VARCHAR(64),
    prediction_date  DATE          NOT NULL DEFAULT CURRENT_DATE,
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (campaign_id, training_month, target_month)
);
CREATE INDEX IF NOT EXISTS idx_fp_campaign ON forecast_predictions(campaign_id, target_month);

-- Rolling predictions (updated each month as new data arrives)
CREATE TABLE IF NOT EXISTS rolling_predictions (
    id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID          NOT NULL REFERENCES tenants(id),
    client_id        UUID          NOT NULL REFERENCES clients(id),
    campaign_id      UUID          NOT NULL REFERENCES campaigns(id),
    prediction_date  DATE          NOT NULL,
    target_month     DATE          NOT NULL,
    predicted_value  NUMERIC(18,2),
    model_version    VARCHAR(64),
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (campaign_id, prediction_date, target_month)
);

-- Prediction vs actual evaluation
CREATE TABLE IF NOT EXISTS prediction_evaluations (
    id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            UUID          NOT NULL REFERENCES tenants(id),
    client_id            UUID          NOT NULL REFERENCES clients(id),
    campaign_id          UUID          NOT NULL REFERENCES campaigns(id),
    target_month         DATE          NOT NULL,
    forecast_prediction  NUMERIC(18,2),
    rolling_prediction   NUMERIC(18,2),
    final_actual         NUMERIC(18,2),
    forecast_error       NUMERIC(18,2),
    rolling_error        NUMERIC(18,2),
    forecast_mape        NUMERIC(8,4),
    rolling_mape         NUMERIC(8,4),
    evaluated_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (campaign_id, target_month)
);

-- Per-record model predictions (partitioned)
CREATE TABLE IF NOT EXISTS predictions (
    id               UUID         NOT NULL DEFAULT gen_random_uuid(),
    tenant_id        UUID         NOT NULL,
    client_id        UUID         NOT NULL,
    campaign_id      UUID         NOT NULL,
    domain_record_id UUID         NOT NULL,
    external_ref     VARCHAR(30)  NOT NULL,
    model_version_id UUID         NOT NULL REFERENCES model_versions(id),
    score            NUMERIC(6,4),
    predicted_label  SMALLINT,    -- 1=will convert, 0=won't
    prediction_date  DATE         NOT NULL,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, prediction_date)
) PARTITION BY RANGE (prediction_date);

CREATE INDEX IF NOT EXISTS idx_pred_campaign ON predictions(campaign_id, prediction_date);
CREATE INDEX IF NOT EXISTS idx_pred_record   ON predictions(domain_record_id, prediction_date);

ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY predictions_tenant_isolation ON predictions
    USING (tenant_id::TEXT = current_setting('app.current_tenant_id', TRUE)
           OR current_setting('app.bypass_rls', TRUE) = 'true');

DO $$
DECLARE start_month DATE; end_month DATE; pname TEXT;
BEGIN
    FOR i IN 0..3 LOOP
        start_month := DATE_TRUNC('month', CURRENT_DATE + (i::TEXT || ' months')::INTERVAL)::DATE;
        end_month   := (start_month + INTERVAL '1 month')::DATE;
        pname       := 'predictions_' || TO_CHAR(start_month, 'YYYY_MM');
        IF NOT EXISTS (SELECT FROM pg_tables WHERE tablename = pname) THEN
            EXECUTE format(
                'CREATE TABLE IF NOT EXISTS %I PARTITION OF predictions '
                'FOR VALUES FROM (%L) TO (%L)',
                pname, start_month, end_month
            );
        END IF;
    END LOOP;
END $$;

-- Model monitoring (PSI, drift, precision/recall)
CREATE TABLE IF NOT EXISTS prediction_daily_metrics (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    model_version_id  UUID         NOT NULL REFERENCES model_versions(id),
    campaign_id       UUID         NOT NULL REFERENCES campaigns(id),
    tenant_id         UUID         NOT NULL REFERENCES tenants(id),
    metric_date       DATE         NOT NULL,
    total_predictions INTEGER      NOT NULL DEFAULT 0,
    evaluated_count   INTEGER      NOT NULL DEFAULT 0,
    precision_score   NUMERIC(8,4),   -- renamed from 'precision' (reserved word risk)
    recall_score      NUMERIC(8,4),
    f1_score          NUMERIC(8,4),
    psi_score         NUMERIC(8,4),
    drift_flag        BOOLEAN      NOT NULL DEFAULT FALSE,
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (model_version_id, campaign_id, metric_date)
);
CREATE INDEX IF NOT EXISTS idx_pdm_tenant_date   ON prediction_daily_metrics(tenant_id, metric_date);
CREATE INDEX IF NOT EXISTS idx_pdm_campaign_date ON prediction_daily_metrics(campaign_id, metric_date);


-- =============================================================
-- AUDIT LOGS (quarterly partitioned, 3-year retention)
-- =============================================================

CREATE TABLE IF NOT EXISTS atsdbwh.audit_logs (
    id          BIGSERIAL    NOT NULL,
    tenant_id   UUID,
    user_id     UUID,
    entity_type VARCHAR(64)  NOT NULL,
    entity_id   TEXT,
    action      VARCHAR(64)  NOT NULL,
    old_data    JSONB,
    new_data    JSONB,
    ip_address  INET,
    user_agent  TEXT,
    request_id  VARCHAR(64),
    occurred_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

DO $$
DECLARE qstart DATE; qend DATE; pname TEXT;
BEGIN
    FOR q IN 0..5 LOOP
        qstart := DATE_TRUNC('quarter',
            CURRENT_DATE + ((q * 3)::TEXT || ' months')::INTERVAL)::DATE;
        qend   := (qstart + INTERVAL '3 months')::DATE;
        pname  := 'audit_logs_' || TO_CHAR(qstart, 'YYYY')
                  || '_q' || EXTRACT(QUARTER FROM qstart)::INT;
        IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'atsdbwh' AND tablename = pname) THEN
            EXECUTE format(
                'CREATE TABLE IF NOT EXISTS atsdbwh.%I PARTITION OF atsdbwh.audit_logs '
                'FOR VALUES FROM (%L) TO (%L)',
                pname, qstart, qend
            );
        END IF;
    END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_audit_tenant_date ON atsdbwh.audit_logs(tenant_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_audit_entity      ON atsdbwh.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_user        ON atsdbwh.audit_logs(user_id, occurred_at);



-- =============================================================
-- PREDICTION SYSTEM — MONTHLY PREDICTIONS + MONITORING
--
-- Three-table design per the document:
--
--   monthly_predictions        — one row per campaign/month/version
--                                supports partial-data v1 → full-data v2 versioning
--
--   prediction_monitoring_daily — daily achievement tracking
--                                 actual vs predicted, updated every night
--
--   upload_batch_metadata      — tracks batch_type (partial/full) and triggers
--                                prediction re-runs when data completeness changes
-- =============================================================

-- Monthly predictions with versioning.
-- A campaign can have multiple prediction versions for the same target month:
--   v1 = prediction made on partial data (e.g. April 1 with 70% of March data)
--   v2 = prediction re-run after full data arrives (April 10)
-- Analytics always use the latest version (MAX(prediction_version)).
CREATE TABLE IF NOT EXISTS monthly_predictions (
    id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID          NOT NULL REFERENCES tenants(id),
    client_id             UUID          NOT NULL REFERENCES clients(id),
    campaign_id           UUID          NOT NULL REFERENCES campaigns(id),

    -- The month being predicted (first day: 2026-04-01 = predict April performance)
    prediction_month      DATE          NOT NULL,
    -- Version increments each time the prediction is re-run (partial → full data)
    prediction_version    SMALLINT      NOT NULL DEFAULT 1,
    -- What triggered this version: 'initial', 'partial_data', 'full_data', 'manual_rerun'
    trigger_reason        VARCHAR(30)   NOT NULL DEFAULT 'initial',

    -- Training data used (the prior month's allocation dataset)
    training_month        DATE          NOT NULL,
    -- What % of training data was available when this prediction ran (0-100)
    data_completeness_pct NUMERIC(5,2)  NOT NULL DEFAULT 100.0,
    -- How many records were available in training data
    training_records      INTEGER       NOT NULL DEFAULT 0,

    -- Predicted outputs — life insurance context
    -- predicted_pmt_count: number of policies expected to pay this month
    predicted_pmt_count   INTEGER,
    -- predicted_pmt_rate: conversion rate (PMT_FLAG=1 / total accounts)
    predicted_pmt_rate    NUMERIC(8,4),
    -- predicted_outstanding_recovery: ₹ outstanding expected to be recovered
    predicted_outstanding_recovery  NUMERIC(18,2),
    -- predicted_recovery_rate: recovery as % of total outstanding
    predicted_recovery_rate         NUMERIC(8,4),

    -- For debt collection domain: rename but same concept
    -- predicted_accounts: number of accounts expected to pay
    predicted_accounts    INTEGER,
    -- predicted_recovery_amount: ₹ expected to be collected
    predicted_recovery_amount       NUMERIC(18,2),
    -- predicted_contact_rate: % of accounts expected to be contacted
    predicted_contact_rate          NUMERIC(8,4),

    -- Model metadata
    model_version         VARCHAR(64),
    model_algorithm       VARCHAR(64),
    -- Feature importances or model metadata
    model_metadata        JSONB,

    -- Who/what ran this prediction
    run_by                UUID          REFERENCES users(id),
    is_active             BOOLEAN       NOT NULL DEFAULT TRUE,  -- FALSE for superseded versions
    created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    UNIQUE (campaign_id, prediction_month, prediction_version)
);

CREATE INDEX IF NOT EXISTS idx_mp_campaign_month  ON monthly_predictions(campaign_id, prediction_month);
CREATE INDEX IF NOT EXISTS idx_mp_tenant_month    ON monthly_predictions(tenant_id, prediction_month);
CREATE INDEX IF NOT EXISTS idx_mp_client_month    ON monthly_predictions(client_id, prediction_month);
-- Fast lookup of latest active prediction for a campaign/month
CREATE INDEX IF NOT EXISTS idx_mp_active          ON monthly_predictions(campaign_id, prediction_month)
    WHERE is_active = TRUE;

ALTER TABLE monthly_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY monthly_predictions_isolation ON monthly_predictions
    USING (tenant_id::TEXT = current_setting('app.current_tenant_id', TRUE)
           OR current_setting('app.bypass_rls', TRUE) = 'true');


-- Daily prediction monitoring — tracks actual vs predicted every day of the month.
-- This is the core "real-time campaign monitoring" table.
-- One row per campaign per day during the prediction month.
--
-- Example (April monitoring, prediction made in late March):
--   Apr 05: predicted_cumulative_rate=10%, actual_cumulative_rate=8%, achievement=80%
--   Apr 10: predicted_cumulative_rate=20%, actual_cumulative_rate=18%, achievement=90%
CREATE TABLE IF NOT EXISTS prediction_monitoring_daily (
    id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID          NOT NULL REFERENCES tenants(id),
    client_id               UUID          NOT NULL REFERENCES clients(id),
    campaign_id             UUID          NOT NULL REFERENCES campaigns(id),
    -- FK to the prediction being monitored (latest active version)
    monthly_prediction_id   UUID          NOT NULL REFERENCES monthly_predictions(id),

    monitoring_date         DATE          NOT NULL,     -- the actual calendar date
    prediction_month        DATE          NOT NULL,     -- which month's prediction we're tracking

    -- ── Predicted targets (from monthly_predictions, prorated to date) ───────
    -- predicted_pmt_count_target: how many PMTs should have happened by this date
    -- (linear proration: if 300 predicted for 30 days, day 10 target = 100)
    predicted_pmt_target    INTEGER,
    predicted_recovery_target   NUMERIC(18,2),
    predicted_rate_target   NUMERIC(8,4),

    -- ── Actual performance (cumulative from month start to this date) ────────
    actual_pmt_count        INTEGER       NOT NULL DEFAULT 0,
    actual_recovery_amount  NUMERIC(18,2) NOT NULL DEFAULT 0,
    actual_recovery_rate    NUMERIC(8,4),
    actual_contact_count    INTEGER       NOT NULL DEFAULT 0,
    actual_ptp_count        INTEGER       NOT NULL DEFAULT 0,

    -- ── Achievement metrics ───────────────────────────────────────────────────
    -- achievement_pct: (actual / predicted_target) * 100
    -- e.g. 80 means 80% of predicted target achieved so far
    achievement_pct         NUMERIC(8,2),
    -- pace_status: are we on track?
    -- 'on_track' >= 90%, 'at_risk' 70-90%, 'behind' < 70%
    pace_status             VARCHAR(15)   CHECK (pace_status IN (
                              'on_track', 'at_risk', 'behind', 'ahead', 'no_data')),

    -- ── Daily (not cumulative) counts for charting ────────────────────────────
    daily_pmt_count         INTEGER       NOT NULL DEFAULT 0,
    daily_recovery_amount   NUMERIC(18,2) NOT NULL DEFAULT 0,
    daily_interactions      INTEGER       NOT NULL DEFAULT 0,

    computed_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (campaign_id, monitoring_date)
);

CREATE INDEX IF NOT EXISTS idx_pmd_tenant_date    ON prediction_monitoring_daily(tenant_id, monitoring_date);
CREATE INDEX IF NOT EXISTS idx_pmd_campaign_date  ON prediction_monitoring_daily(campaign_id, monitoring_date);
CREATE INDEX IF NOT EXISTS idx_pmd_prediction     ON prediction_monitoring_daily(monthly_prediction_id, monitoring_date);
CREATE INDEX IF NOT EXISTS idx_pmd_pace           ON prediction_monitoring_daily(campaign_id, monitoring_date)
    WHERE pace_status IN ('at_risk', 'behind');

ALTER TABLE prediction_monitoring_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY pmd_isolation ON prediction_monitoring_daily
    USING (tenant_id::TEXT = current_setting('app.current_tenant_id', TRUE)
           OR current_setting('app.bypass_rls', TRUE) = 'true');


-- Upload batch metadata — tracks partial vs full data arrival.
-- Drives the prediction versioning system:
--   When a batch arrives and data_completeness_pct crosses 100%, trigger prediction v2.
--   When a batch arrives with data_completeness_pct < 100%, trigger prediction v1.
CREATE TABLE IF NOT EXISTS upload_batch_metadata (
    id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID          NOT NULL REFERENCES tenants(id),
    client_id             UUID          NOT NULL REFERENCES clients(id),
    campaign_id           UUID          NOT NULL REFERENCES campaigns(id),
    batch_id              UUID          NOT NULL REFERENCES ingestion_batches(id),

    -- The dataset month this batch covers (e.g. 2026-03-01 = March data)
    dataset_month         DATE          NOT NULL,
    -- partial: first/middle batch; full: final complete dataset; incremental: daily feed
    batch_type            VARCHAR(20)   NOT NULL DEFAULT 'full'
                          CHECK (batch_type IN ('partial', 'full', 'incremental', 'correction')),
    -- How complete is this dataset as of this batch? (0-100)
    data_completeness_pct NUMERIC(5,2)  NOT NULL DEFAULT 100.0,
    -- Expected total records (if client provides manifest)
    expected_records      INTEGER,
    -- Actual records in this batch
    actual_records        INTEGER       NOT NULL DEFAULT 0,
    -- Cumulative records received so far for this campaign+month
    cumulative_records    INTEGER       NOT NULL DEFAULT 0,

    -- Did this batch trigger a prediction run? Which version?
    prediction_triggered  BOOLEAN       NOT NULL DEFAULT FALSE,
    prediction_version    SMALLINT,
    prediction_run_at     TIMESTAMPTZ,

    -- Notes from the uploader about this batch
    notes                 TEXT,
    created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ubm_campaign_month ON upload_batch_metadata(campaign_id, dataset_month);
CREATE INDEX IF NOT EXISTS idx_ubm_batch          ON upload_batch_metadata(batch_id);
CREATE INDEX IF NOT EXISTS idx_ubm_type           ON upload_batch_metadata(tenant_id, batch_type);


-- =============================================================
-- SEED DATA
-- =============================================================

INSERT INTO tenants (id, code, name, is_active)
VALUES ('00000000-0000-0000-0000-000000000001', 'SYSTEM', 'ATS_CRP Platform', TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO users (id, tenant_id, email, password_hash, full_name, role)
VALUES (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'admin@servicesats.com',
    '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW',
    'System Administrator',
    'superadmin'
) ON CONFLICT DO NOTHING;

-- Life insurance clients (currently active)
-- Health insurance and debt collection clients are placeholders —
-- schema will be enriched when first real datasets arrive.
INSERT INTO clients (id, tenant_id, client_name, client_code, domain_type) VALUES
    ('10000000-0000-0000-0000-000000000001',
     '00000000-0000-0000-0000-000000000001',
     'Birla Sun Life Insurance', 'BSLI', 'life_insurance'),
    ('10000000-0000-0000-0000-000000000002',
     '00000000-0000-0000-0000-000000000001',
     'HDFC Life Insurance', 'HDFC', 'life_insurance'),
    ('10000000-0000-0000-0000-000000000003',
     '00000000-0000-0000-0000-000000000001',
     'Star Health & Allied Insurance', 'STAR', 'health_insurance'),
    ('10000000-0000-0000-0000-000000000004',
     '00000000-0000-0000-0000-000000000001',
     'ICICI Bank Collections', 'ICICI', 'debt_collection')
ON CONFLICT DO NOTHING;

INSERT INTO model_versions (id, version_name, algorithm, domain, status, deployed_at)
VALUES (
    '00000000-0000-0000-0000-000000000003',
    'propensity_v3.2', 'XGBoost', 'life_retention', 'active', NOW()
) ON CONFLICT DO NOTHING;
