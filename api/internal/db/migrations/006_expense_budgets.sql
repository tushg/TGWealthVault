-- +goose Up
CREATE TABLE IF NOT EXISTS expense_budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    allocated_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
    notes TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT expense_budgets_name_unique UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS expense_budgets_active_idx ON expense_budgets(active);

ALTER TABLE cashflow_entries
  ADD COLUMN IF NOT EXISTS budget_id UUID REFERENCES expense_budgets(id) ON DELETE SET NULL;

-- +goose Down
ALTER TABLE cashflow_entries DROP COLUMN IF EXISTS budget_id;
DROP TABLE IF EXISTS expense_budgets;
