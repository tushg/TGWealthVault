package services

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"

	"github.com/tushg/TGWealthVault/api/internal/models"
)

type FinanceService struct {
	pool *pgxpool.Pool
}

func NewFinanceService(pool *pgxpool.Pool) *FinanceService {
	return &FinanceService{pool: pool}
}

func (s *FinanceService) Dashboard(ctx context.Context) (*models.DashboardSummary, error) {
	sum := &models.DashboardSummary{
		TotalDeposits:    decimal.Zero,
		TotalMFValue:     decimal.Zero,
		TotalGoalsTarget: decimal.Zero,
		TotalGoalsSaved:  decimal.Zero,
		MonthIncome:      decimal.Zero,
		MonthExpense:     decimal.Zero,
	}

	_ = s.pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(principal),0) FROM deposits WHERE status='active'
	`).Scan(&sum.TotalDeposits)

	_ = s.pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(COALESCE(current_value, invested_amount, 0)),0) FROM mf_holdings
	`).Scan(&sum.TotalMFValue)

	_ = s.pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(target_amount),0), COALESCE(SUM(current_amount),0) FROM goals
	`).Scan(&sum.TotalGoalsTarget, &sum.TotalGoalsSaved)

	monthStart := time.Now().UTC().Truncate(24*time.Hour)
	monthStart = time.Date(monthStart.Year(), monthStart.Month(), 1, 0, 0, 0, 0, time.UTC)
	_ = s.pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount),0) FROM cashflow_entries WHERE type='income' AND entry_month=$1
	`, monthStart).Scan(&sum.MonthIncome)
	_ = s.pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount),0) FROM cashflow_entries WHERE type='expense' AND entry_month=$1
	`, monthStart).Scan(&sum.MonthExpense)

	_ = s.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM deposits
		WHERE status='active' AND maturity_date <= CURRENT_DATE + INTERVAL '30 days'
	`).Scan(&sum.UpcomingMaturities)

	_ = s.pool.QueryRow(ctx, `SELECT COUNT(*) FROM policies WHERE status='active'`).Scan(&sum.ActivePolicies)

	return sum, nil
}

func (s *FinanceService) ListPersons(ctx context.Context) ([]models.Person, error) {
	rows, err := s.pool.Query(ctx, `SELECT id, name, relation, created_at, updated_at FROM persons ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.Person
	for rows.Next() {
		var p models.Person
		if err := rows.Scan(&p.ID, &p.Name, &p.Relation, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *FinanceService) CreatePerson(ctx context.Context, name string, relation *string) (*models.Person, error) {
	var p models.Person
	err := s.pool.QueryRow(ctx, `
		INSERT INTO persons (name, relation) VALUES ($1, $2)
		RETURNING id, name, relation, created_at, updated_at
	`, name, relation).Scan(&p.ID, &p.Name, &p.Relation, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (s *FinanceService) ListDeposits(ctx context.Context) ([]models.Deposit, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, person_id, type, bank_name, principal, interest_rate, start_date, maturity_date,
		       maturity_amount, compounding, status, alert_days_before, created_at, updated_at
		FROM deposits ORDER BY maturity_date
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.Deposit
	for rows.Next() {
		var d models.Deposit
		if err := rows.Scan(&d.ID, &d.PersonID, &d.Type, &d.BankName, &d.Principal, &d.InterestRate,
			&d.StartDate, &d.MaturityDate, &d.MaturityAmount, &d.Compounding, &d.Status,
			&d.AlertDaysBefore, &d.CreatedAt, &d.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

type CreateDepositInput struct {
	PersonID        *uuid.UUID       `json:"person_id"`
	Type            string           `json:"type"`
	BankName        string           `json:"bank_name"`
	Principal       decimal.Decimal  `json:"principal"`
	InterestRate    decimal.Decimal  `json:"interest_rate"`
	StartDate       time.Time        `json:"start_date"`
	MaturityDate    time.Time        `json:"maturity_date"`
	MaturityAmount  *decimal.Decimal `json:"maturity_amount"`
	Compounding     *string          `json:"compounding"`
	AlertDaysBefore int              `json:"alert_days_before"`
}

func (s *FinanceService) CreateDeposit(ctx context.Context, in CreateDepositInput) (*models.Deposit, error) {
	if in.AlertDaysBefore <= 0 {
		in.AlertDaysBefore = 14
	}
	var d models.Deposit
	err := s.pool.QueryRow(ctx, `
		INSERT INTO deposits (person_id, type, bank_name, principal, interest_rate, start_date, maturity_date,
		                      maturity_amount, compounding, alert_days_before)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		RETURNING id, person_id, type, bank_name, principal, interest_rate, start_date, maturity_date,
		          maturity_amount, compounding, status, alert_days_before, created_at, updated_at
	`, in.PersonID, in.Type, in.BankName, in.Principal, in.InterestRate, in.StartDate, in.MaturityDate,
		in.MaturityAmount, in.Compounding, in.AlertDaysBefore).Scan(
		&d.ID, &d.PersonID, &d.Type, &d.BankName, &d.Principal, &d.InterestRate, &d.StartDate, &d.MaturityDate,
		&d.MaturityAmount, &d.Compounding, &d.Status, &d.AlertDaysBefore, &d.CreatedAt, &d.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &d, nil
}

func (s *FinanceService) ListGoals(ctx context.Context) ([]models.Goal, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, person_id, name, target_amount, current_amount, target_date, category, created_at, updated_at
		FROM goals ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.Goal
	for rows.Next() {
		var g models.Goal
		if err := rows.Scan(&g.ID, &g.PersonID, &g.Name, &g.TargetAmount, &g.CurrentAmount, &g.TargetDate, &g.Category, &g.CreatedAt, &g.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

type CreateGoalInput struct {
	PersonID      *uuid.UUID      `json:"person_id"`
	Name          string          `json:"name"`
	TargetAmount  decimal.Decimal `json:"target_amount"`
	CurrentAmount decimal.Decimal `json:"current_amount"`
	TargetDate    *time.Time      `json:"target_date"`
	Category      *string         `json:"category"`
}

func (s *FinanceService) CreateGoal(ctx context.Context, in CreateGoalInput) (*models.Goal, error) {
	var g models.Goal
	err := s.pool.QueryRow(ctx, `
		INSERT INTO goals (person_id, name, target_amount, current_amount, target_date, category)
		VALUES ($1,$2,$3,$4,$5,$6)
		RETURNING id, person_id, name, target_amount, current_amount, target_date, category, created_at, updated_at
	`, in.PersonID, in.Name, in.TargetAmount, in.CurrentAmount, in.TargetDate, in.Category).Scan(
		&g.ID, &g.PersonID, &g.Name, &g.TargetAmount, &g.CurrentAmount, &g.TargetDate, &g.Category, &g.CreatedAt, &g.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &g, nil
}

func (s *FinanceService) ListMF(ctx context.Context) ([]models.MFHolding, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, person_id, amc, scheme_name, scheme_code, units, nav, nav_date,
		       invested_amount, current_value, category, source, created_at, updated_at
		FROM mf_holdings ORDER BY scheme_name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.MFHolding
	for rows.Next() {
		var h models.MFHolding
		if err := rows.Scan(&h.ID, &h.PersonID, &h.AMC, &h.SchemeName, &h.SchemeCode, &h.Units, &h.NAV, &h.NAVDate,
			&h.InvestedAmount, &h.CurrentValue, &h.Category, &h.Source, &h.CreatedAt, &h.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, h)
	}
	return out, rows.Err()
}

func (s *FinanceService) ListPolicies(ctx context.Context) ([]models.Policy, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, person_id, insurer, policy_type, premium_amount, premium_frequency, sum_assured,
		       start_date, end_date, next_due_date, status, created_at, updated_at
		FROM policies ORDER BY insurer
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.Policy
	for rows.Next() {
		var p models.Policy
		if err := rows.Scan(&p.ID, &p.PersonID, &p.Insurer, &p.PolicyType, &p.PremiumAmount, &p.PremiumFrequency,
			&p.SumAssured, &p.StartDate, &p.EndDate, &p.NextDueDate, &p.Status, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *FinanceService) ListCashflow(ctx context.Context) ([]models.CashflowEntry, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, person_id, type, category, amount, entry_month, recurring, created_at, updated_at
		FROM cashflow_entries ORDER BY entry_month DESC, created_at DESC LIMIT 200
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.CashflowEntry
	for rows.Next() {
		var e models.CashflowEntry
		if err := rows.Scan(&e.ID, &e.PersonID, &e.Type, &e.Category, &e.Amount, &e.EntryMonth, &e.Recurring, &e.CreatedAt, &e.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

type CreateCashflowInput struct {
	PersonID   *uuid.UUID      `json:"person_id"`
	Type       string          `json:"type"`
	Category   string          `json:"category"`
	Amount     decimal.Decimal `json:"amount"`
	EntryMonth time.Time       `json:"entry_month"`
	Recurring  bool            `json:"recurring"`
}

func (s *FinanceService) CreateCashflow(ctx context.Context, in CreateCashflowInput) (*models.CashflowEntry, error) {
	var e models.CashflowEntry
	err := s.pool.QueryRow(ctx, `
		INSERT INTO cashflow_entries (person_id, type, category, amount, entry_month, recurring)
		VALUES ($1,$2,$3,$4,$5,$6)
		RETURNING id, person_id, type, category, amount, entry_month, recurring, created_at, updated_at
	`, in.PersonID, in.Type, in.Category, in.Amount, in.EntryMonth, in.Recurring).Scan(
		&e.ID, &e.PersonID, &e.Type, &e.Category, &e.Amount, &e.EntryMonth, &e.Recurring, &e.CreatedAt, &e.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &e, nil
}
