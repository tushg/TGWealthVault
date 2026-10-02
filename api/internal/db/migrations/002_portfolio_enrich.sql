-- MF statements already exist; add unique holding key helpers and cashflow categories seed notes.

ALTER TABLE mf_holdings
  ADD COLUMN IF NOT EXISTS folio_display TEXT,
  ADD COLUMN IF NOT EXISTS isin TEXT,
  ADD COLUMN IF NOT EXISTS absolute_return NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS weight_pct NUMERIC(8,4);

ALTER TABLE goals
  ADD COLUMN IF NOT EXISTS goal_type TEXT DEFAULT 'custom'
    CHECK (goal_type IN ('home','education','retirement','emergency','wedding','vehicle','custom')),
  ADD COLUMN IF NOT EXISTS monthly_contribution NUMERIC(18,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS priority INT DEFAULT 3;

ALTER TABLE mf_statements
  ADD COLUMN IF NOT EXISTS holdings_imported INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS parse_notes TEXT;
