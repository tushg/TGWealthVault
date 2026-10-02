-- +goose Up
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    mfa_secret_enc TEXT,
    mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    mfa_verified BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_agent TEXT,
    ip_hash TEXT
);

CREATE INDEX sessions_user_id_idx ON sessions(user_id);
CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE persons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    relation TEXT,
    notes_enc TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE deposits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id UUID REFERENCES persons(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('FD', 'RD')),
    bank_name TEXT NOT NULL,
    account_ref_enc TEXT,
    principal NUMERIC(18,2) NOT NULL,
    interest_rate NUMERIC(8,4) NOT NULL,
    start_date DATE NOT NULL,
    maturity_date DATE NOT NULL,
    maturity_amount NUMERIC(18,2),
    compounding TEXT DEFAULT 'quarterly',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'matured', 'closed')),
    notes_enc TEXT,
    alert_days_before INT NOT NULL DEFAULT 14,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX deposits_maturity_date_idx ON deposits(maturity_date);
CREATE INDEX deposits_person_id_idx ON deposits(person_id);

CREATE TABLE mf_holdings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id UUID REFERENCES persons(id) ON DELETE SET NULL,
    folio_enc TEXT,
    amc TEXT,
    scheme_name TEXT NOT NULL,
    scheme_code TEXT,
    units NUMERIC(18,6) NOT NULL DEFAULT 0,
    nav NUMERIC(18,4),
    nav_date DATE,
    invested_amount NUMERIC(18,2),
    current_value NUMERIC(18,2),
    category TEXT,
    source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'cams', 'kfin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE mf_statements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id UUID REFERENCES persons(id) ON DELETE SET NULL,
    source TEXT NOT NULL CHECK (source IN ('cams', 'kfin')),
    filename TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    password_hint_enc TEXT,
    parsed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'parsed', 'failed')),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id UUID REFERENCES persons(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    target_amount NUMERIC(18,2) NOT NULL,
    current_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
    target_date DATE,
    category TEXT,
    notes_enc TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE goal_assets (
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    asset_type TEXT NOT NULL CHECK (asset_type IN ('deposit', 'mf', 'policy', 'cash')),
    asset_id UUID NOT NULL,
    allocated_amount NUMERIC(18,2),
    PRIMARY KEY (goal_id, asset_type, asset_id)
);

CREATE TABLE policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id UUID REFERENCES persons(id) ON DELETE SET NULL,
    insurer TEXT NOT NULL,
    policy_type TEXT NOT NULL,
    policy_number_enc TEXT,
    premium_amount NUMERIC(18,2),
    premium_frequency TEXT,
    sum_assured NUMERIC(18,2),
    start_date DATE,
    end_date DATE,
    next_due_date DATE,
    status TEXT NOT NULL DEFAULT 'active',
    notes_enc TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE cashflow_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id UUID REFERENCES persons(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    category TEXT NOT NULL,
    amount NUMERIC(18,2) NOT NULL,
    entry_month DATE NOT NULL,
    description_enc TEXT,
    recurring BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX cashflow_entry_month_idx ON cashflow_entries(entry_month);

CREATE TABLE alert_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind TEXT NOT NULL,
    reference_id UUID,
    channel TEXT NOT NULL,
    payload_summary TEXT,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- +goose Down
DROP TABLE IF EXISTS alert_log;
DROP TABLE IF EXISTS cashflow_entries;
DROP TABLE IF EXISTS policies;
DROP TABLE IF EXISTS goal_assets;
DROP TABLE IF EXISTS goals;
DROP TABLE IF EXISTS mf_statements;
DROP TABLE IF EXISTS mf_holdings;
DROP TABLE IF EXISTS deposits;
DROP TABLE IF EXISTS persons;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;
