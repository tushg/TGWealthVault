CREATE TABLE IF NOT EXISTS mf_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    holding_id UUID NOT NULL REFERENCES mf_holdings(id) ON DELETE CASCADE,
    statement_id UUID REFERENCES mf_statements(id) ON DELETE SET NULL,
    txn_date DATE NOT NULL,
    description TEXT,
    txn_type TEXT NOT NULL DEFAULT 'other',
    amount NUMERIC(18,2),
    units NUMERIC(18,6),
    nav NUMERIC(18,4),
    balance_units NUMERIC(18,6),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mf_transactions_holding_id_idx ON mf_transactions(holding_id);
CREATE INDEX IF NOT EXISTS mf_transactions_txn_date_idx ON mf_transactions(txn_date);
CREATE INDEX IF NOT EXISTS mf_transactions_statement_id_idx ON mf_transactions(statement_id);

ALTER TABLE mf_statements
  ADD COLUMN IF NOT EXISTS transactions_imported INT DEFAULT 0;
