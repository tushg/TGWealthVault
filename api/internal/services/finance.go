package services

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"

	"github.com/tushg/TGWealthVault/api/internal/models"
)

type FinanceService struct {
	pool   *pgxpool.Pool
	alerts *AlertService
}

func NewFinanceService(pool *pgxpool.Pool, alerts *AlertService) *FinanceService {
	return &FinanceService{pool: pool, alerts: alerts}
}

func (s *FinanceService) SyncMaturedDeposits(ctx context.Context) error {
	if s.alerts != nil {
		return s.alerts.SyncDepositAlerts(ctx)
	}
	_, err := s.pool.Exec(ctx, `
		UPDATE deposits
		SET status = 'matured', updated_at = NOW()
		WHERE status = 'active' AND maturity_date::date <= CURRENT_DATE
	`)
	return err
}

func (s *FinanceService) Dashboard(ctx context.Context) (*models.DashboardSummary, error) {
	p, err := s.Portfolio(ctx)
	if err != nil {
		return nil, err
	}
	return &models.DashboardSummary{
		TotalDeposits:      p.TotalDeposits,
		TotalMFValue:       p.TotalMFValue,
		TotalGoalsTarget:   p.TotalGoalsTarget,
		TotalGoalsSaved:    p.TotalGoalsSaved,
		MonthIncome:        p.MonthIncome,
		MonthExpense:       p.MonthExpense,
		UpcomingMaturities: p.UpcomingMaturities,
		ActivePolicies:     p.ActivePolicies,
	}, nil
}

func (s *FinanceService) Portfolio(ctx context.Context) (*models.PortfolioOverview, error) {
	_ = s.SyncMaturedDeposits(ctx)

	p := &models.PortfolioOverview{
		TotalDeposits:    decimal.Zero,
		TotalMFValue:     decimal.Zero,
		TotalGoalsTarget: decimal.Zero,
		TotalGoalsSaved:  decimal.Zero,
		MonthIncome:      decimal.Zero,
		MonthExpense:     decimal.Zero,
		Allocation:       []models.AllocationSlice{},
		Actions:          []models.ActionItem{},
		TopHoldings:      []models.MFHolding{},
		Goals:            []models.Goal{},
	}

	_ = s.pool.QueryRow(ctx, `SELECT COALESCE(SUM(principal),0) FROM deposits WHERE status='active'`).Scan(&p.TotalDeposits)
	_ = s.pool.QueryRow(ctx, `SELECT COALESCE(SUM(COALESCE(current_value, invested_amount, 0)),0), COUNT(*) FROM mf_holdings`).Scan(&p.TotalMFValue, &p.MFCount)
	_ = s.pool.QueryRow(ctx, `SELECT COALESCE(SUM(target_amount),0), COALESCE(SUM(current_amount),0) FROM goals`).Scan(&p.TotalGoalsTarget, &p.TotalGoalsSaved)

	monthStart := time.Date(time.Now().UTC().Year(), time.Now().UTC().Month(), 1, 0, 0, 0, 0, time.UTC)
	_ = s.pool.QueryRow(ctx, `SELECT COALESCE(SUM(amount),0) FROM cashflow_entries WHERE type='income' AND entry_month=$1`, monthStart).Scan(&p.MonthIncome)
	_ = s.pool.QueryRow(ctx, `SELECT COALESCE(SUM(amount),0) FROM cashflow_entries WHERE type='expense' AND entry_month=$1`, monthStart).Scan(&p.MonthExpense)
	_ = s.pool.QueryRow(ctx, `SELECT COUNT(*) FROM deposits WHERE status='active' AND maturity_date <= CURRENT_DATE + INTERVAL '30 days'`).Scan(&p.UpcomingMaturities)
	_ = s.pool.QueryRow(ctx, `SELECT COUNT(*) FROM policies WHERE status='active'`).Scan(&p.ActivePolicies)
	if s.alerts != nil {
		p.OpenAlerts, _ = s.alerts.CountOpen(ctx)
	}

	p.NetWorth = p.TotalDeposits.Add(p.TotalMFValue)
	p.MonthSurplus = p.MonthIncome.Sub(p.MonthExpense)
	if !p.TotalGoalsTarget.IsZero() {
		p.GoalFundingPct = p.TotalGoalsSaved.Div(p.TotalGoalsTarget).Mul(decimal.NewFromInt(100)).Round(1)
	}

	total := p.NetWorth
	addAlloc := func(name string, v decimal.Decimal) {
		w := decimal.Zero
		if !total.IsZero() {
			w = v.Div(total).Mul(decimal.NewFromInt(100)).Round(1)
		}
		if !v.IsZero() {
			p.Allocation = append(p.Allocation, models.AllocationSlice{Name: name, Value: v, Weight: w})
		}
	}
	addAlloc("Fixed deposits", p.TotalDeposits)
	addAlloc("Mutual funds", p.TotalMFValue)

	if p.OpenAlerts > 0 {
		p.Actions = append([]models.ActionItem{{
			Kind: "alerts", Title: fmt.Sprintf("%d open alert(s)", p.OpenAlerts), Detail: "Confirm maturity and vault notices in Alerts.", Severity: "warn", Href: "/alerts",
		}}, p.Actions...)
	}
	if p.MFCount == 0 {
		p.Actions = append(p.Actions, models.ActionItem{
			Kind: "import", Title: "Import CAMS / KFin CAS", Detail: "Upload your consolidated account statement to load folios.", Severity: "info", Href: "/import",
		})
	}
	if p.UpcomingMaturities > 0 {
		p.Actions = append(p.Actions, models.ActionItem{
			Kind: "maturity", Title: fmt.Sprintf("%d deposit(s) maturing in 30 days", p.UpcomingMaturities), Detail: "Review rollover vs goal funding.", Severity: "warn", Href: "/deposits",
		})
	}
	if p.ActivePolicies == 0 {
		p.Actions = append(p.Actions, models.ActionItem{
			Kind: "protect", Title: "Add insurance cover", Detail: "Register term/health policies so premium dues stay visible.", Severity: "info", Href: "/policies",
		})
	}
	if p.TotalGoalsTarget.IsZero() {
		p.Actions = append(p.Actions, models.ActionItem{
			Kind: "goal", Title: "Define your first goal", Detail: "Home, education, retirement — bank-style goal missions.", Severity: "info", Href: "/goals",
		})
	}

	holdings, _ := s.ListMF(ctx)
	sort.Slice(holdings, func(i, j int) bool {
		vi, vj := decimal.Zero, decimal.Zero
		if holdings[i].CurrentValue != nil {
			vi = *holdings[i].CurrentValue
		}
		if holdings[j].CurrentValue != nil {
			vj = *holdings[j].CurrentValue
		}
		return vi.GreaterThan(vj)
	})
	if len(holdings) > 5 {
		p.TopHoldings = holdings[:5]
	} else {
		p.TopHoldings = holdings
	}

	goals, _ := s.ListGoals(ctx)
	p.Goals = goals
	return p, nil
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

func (s *FinanceService) DeletePerson(ctx context.Context, id uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM persons WHERE id=$1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("person not found")
	}
	return nil
}

func (s *FinanceService) ListDeposits(ctx context.Context, status string) ([]models.Deposit, error) {
	_ = s.SyncMaturedDeposits(ctx)

	q := `
		SELECT id, person_id, type, bank_name, fd_number, principal, interest_rate, start_date, maturity_date,
		       maturity_amount, compounding, status, alert_days_before, created_at, updated_at
		FROM deposits`
	args := []any{}
	switch status {
	case "active", "matured", "closed":
		q += ` WHERE status = $1`
		args = append(args, status)
	}
	q += ` ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'matured' THEN 1 ELSE 2 END, maturity_date`

	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.Deposit
	for rows.Next() {
		var d models.Deposit
		if err := rows.Scan(&d.ID, &d.PersonID, &d.Type, &d.BankName, &d.FDNumber, &d.Principal, &d.InterestRate,
			&d.StartDate, &d.MaturityDate, &d.MaturityAmount, &d.Compounding, &d.Status,
			&d.AlertDaysBefore, &d.CreatedAt, &d.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	if out == nil {
		out = []models.Deposit{}
	}
	return out, rows.Err()
}

type CreateDepositInput struct {
	PersonID        *uuid.UUID       `json:"person_id"`
	Type            string           `json:"type"`
	BankName        string           `json:"bank_name"`
	FDNumber        *string          `json:"fd_number"`
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
	status := "active"
	today := time.Now().In(in.MaturityDate.Location()).Truncate(24 * time.Hour)
	matDay := in.MaturityDate.Truncate(24 * time.Hour)
	if !matDay.After(today) {
		status = "matured"
	}

	var d models.Deposit
	err := s.pool.QueryRow(ctx, `
		INSERT INTO deposits (person_id, type, bank_name, fd_number, principal, interest_rate, start_date, maturity_date,
		                      maturity_amount, compounding, alert_days_before, status)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
		RETURNING id, person_id, type, bank_name, fd_number, principal, interest_rate, start_date, maturity_date,
		          maturity_amount, compounding, status, alert_days_before, created_at, updated_at
	`, in.PersonID, in.Type, in.BankName, nullEmptyStr(in.FDNumber), in.Principal, in.InterestRate, in.StartDate, in.MaturityDate,
		in.MaturityAmount, in.Compounding, in.AlertDaysBefore, status).Scan(
		&d.ID, &d.PersonID, &d.Type, &d.BankName, &d.FDNumber, &d.Principal, &d.InterestRate, &d.StartDate, &d.MaturityDate,
		&d.MaturityAmount, &d.Compounding, &d.Status, &d.AlertDaysBefore, &d.CreatedAt, &d.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if status == "matured" && s.alerts != nil {
		_ = s.alerts.NotifyDepositMatured(ctx, &d)
	}
	return &d, nil
}

func (s *FinanceService) DeleteDeposit(ctx context.Context, id uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM deposits WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("deposit not found")
	}
	return nil
}

func (s *FinanceService) MarkDepositMatured(ctx context.Context, id uuid.UUID) (*models.Deposit, error) {
	var d models.Deposit
	err := s.pool.QueryRow(ctx, `
		UPDATE deposits SET status = 'matured', updated_at = NOW()
		WHERE id = $1
		RETURNING id, person_id, type, bank_name, fd_number, principal, interest_rate, start_date, maturity_date,
		          maturity_amount, compounding, status, alert_days_before, created_at, updated_at
	`, id).Scan(
		&d.ID, &d.PersonID, &d.Type, &d.BankName, &d.FDNumber, &d.Principal, &d.InterestRate, &d.StartDate, &d.MaturityDate,
		&d.MaturityAmount, &d.Compounding, &d.Status, &d.AlertDaysBefore, &d.CreatedAt, &d.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if s.alerts != nil {
		_ = s.alerts.NotifyDepositMatured(ctx, &d)
	}
	return &d, nil
}

func nullEmptyStr(s *string) *string {
	if s == nil {
		return nil
	}
	v := strings.TrimSpace(*s)
	if v == "" {
		return nil
	}
	return &v
}

func (s *FinanceService) ListGoals(ctx context.Context) ([]models.Goal, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, person_id, name, target_amount, current_amount, target_date, category,
		       COALESCE(goal_type,'custom'), COALESCE(monthly_contribution,0), COALESCE(priority,3),
		       created_at, updated_at
		FROM goals ORDER BY priority ASC, created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.Goal
	for rows.Next() {
		var g models.Goal
		if err := rows.Scan(&g.ID, &g.PersonID, &g.Name, &g.TargetAmount, &g.CurrentAmount, &g.TargetDate, &g.Category,
			&g.GoalType, &g.MonthlyContribution, &g.Priority, &g.CreatedAt, &g.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

type CreateGoalInput struct {
	PersonID            *uuid.UUID `json:"person_id"`
	Name                string     `json:"name"`
	TargetAmount        any        `json:"target_amount"`
	CurrentAmount       any        `json:"current_amount"`
	TargetDate          *string    `json:"target_date"`
	Category            any        `json:"category"`
	GoalType            string     `json:"goal_type"`
	MonthlyContribution any        `json:"monthly_contribution"`
	Priority            any        `json:"priority"`
}

func (s *FinanceService) CreateGoal(ctx context.Context, in CreateGoalInput) (*models.Goal, error) {
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return nil, fmt.Errorf("name is required")
	}
	target, err := parseDecimalAny(in.TargetAmount)
	if err != nil || target.IsZero() || target.IsNegative() {
		return nil, fmt.Errorf("target_amount must be a positive number")
	}
	current, _ := parseDecimalAny(in.CurrentAmount)
	if current.IsNegative() {
		current = decimal.Zero
	}
	monthly, _ := parseDecimalAny(in.MonthlyContribution)
	if monthly.IsNegative() {
		monthly = decimal.Zero
	}
	priority := parseIntAny(in.Priority, 3)
	if priority < 1 {
		priority = 1
	}
	if priority > 5 {
		priority = 5
	}
	goalType := strings.ToLower(strings.TrimSpace(in.GoalType))
	switch goalType {
	case "home", "education", "retirement", "emergency", "wedding", "vehicle", "custom":
	default:
		goalType = "custom"
	}
	category := parseOptionalString(in.Category)
	if category == nil {
		c := goalType
		category = &c
	}
	var targetDate *time.Time
	if in.TargetDate != nil && strings.TrimSpace(*in.TargetDate) != "" {
		raw := strings.TrimSpace(*in.TargetDate)
		parsed, err := time.Parse(time.RFC3339, raw)
		if err != nil {
			parsed, err = time.Parse("2006-01-02", raw)
		}
		if err != nil {
			return nil, fmt.Errorf("invalid target_date")
		}
		d := time.Date(parsed.Year(), parsed.Month(), parsed.Day(), 0, 0, 0, 0, time.UTC)
		targetDate = &d
	}

	var g models.Goal
	err = s.pool.QueryRow(ctx, `
		INSERT INTO goals (person_id, name, target_amount, current_amount, target_date, category, goal_type, monthly_contribution, priority)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		RETURNING id, person_id, name, target_amount, current_amount, target_date, category,
		          COALESCE(goal_type,'custom'), COALESCE(monthly_contribution,0), COALESCE(priority,3), created_at, updated_at
	`, in.PersonID, name, target, current, targetDate, category, goalType, monthly, priority).Scan(
		&g.ID, &g.PersonID, &g.Name, &g.TargetAmount, &g.CurrentAmount, &g.TargetDate, &g.Category,
		&g.GoalType, &g.MonthlyContribution, &g.Priority, &g.CreatedAt, &g.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &g, nil
}

func (s *FinanceService) DeleteGoal(ctx context.Context, id uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM goals WHERE id=$1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("goal not found")
	}
	return nil
}

type UpdateGoalInput struct {
	Name                *string `json:"name"`
	TargetAmount        any     `json:"target_amount"`
	CurrentAmount       any     `json:"current_amount"`
	TargetDate          *string `json:"target_date"`
	Category            any     `json:"category"`
	GoalType            *string `json:"goal_type"`
	MonthlyContribution any     `json:"monthly_contribution"`
	Priority            any     `json:"priority"`
}

func (s *FinanceService) UpdateGoal(ctx context.Context, id uuid.UUID, in UpdateGoalInput) (*models.Goal, error) {
	var g models.Goal
	err := s.pool.QueryRow(ctx, `
		SELECT id, person_id, name, target_amount, current_amount, target_date, category,
		       COALESCE(goal_type,'custom'), COALESCE(monthly_contribution,0), COALESCE(priority,3), created_at, updated_at
		FROM goals WHERE id=$1
	`, id).Scan(
		&g.ID, &g.PersonID, &g.Name, &g.TargetAmount, &g.CurrentAmount, &g.TargetDate, &g.Category,
		&g.GoalType, &g.MonthlyContribution, &g.Priority, &g.CreatedAt, &g.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("goal not found")
	}

	if in.Name != nil {
		name := strings.TrimSpace(*in.Name)
		if name == "" {
			return nil, fmt.Errorf("name is required")
		}
		g.Name = name
	}
	if in.TargetAmount != nil {
		target, err := parseDecimalAny(in.TargetAmount)
		if err != nil || target.IsZero() || target.IsNegative() {
			return nil, fmt.Errorf("target_amount must be a positive number")
		}
		g.TargetAmount = target
	}
	if in.CurrentAmount != nil {
		current, err := parseDecimalAny(in.CurrentAmount)
		if err != nil || current.IsNegative() {
			return nil, fmt.Errorf("current_amount must be zero or positive")
		}
		g.CurrentAmount = current
	}
	if in.MonthlyContribution != nil {
		monthly, err := parseDecimalAny(in.MonthlyContribution)
		if err != nil || monthly.IsNegative() {
			return nil, fmt.Errorf("monthly_contribution must be zero or positive")
		}
		g.MonthlyContribution = monthly
	}
	if in.Priority != nil {
		priority := parseIntAny(in.Priority, g.Priority)
		if priority < 1 {
			priority = 1
		}
		if priority > 5 {
			priority = 5
		}
		g.Priority = priority
	}
	if in.GoalType != nil {
		goalType := strings.ToLower(strings.TrimSpace(*in.GoalType))
		switch goalType {
		case "home", "education", "retirement", "emergency", "wedding", "vehicle", "custom":
			g.GoalType = goalType
		default:
			return nil, fmt.Errorf("invalid goal_type")
		}
	}
	if in.Category != nil {
		g.Category = parseOptionalString(in.Category)
	}
	if in.TargetDate != nil {
		raw := strings.TrimSpace(*in.TargetDate)
		if raw == "" {
			g.TargetDate = nil
		} else {
			parsed, err := time.Parse(time.RFC3339, raw)
			if err != nil {
				parsed, err = time.Parse("2006-01-02", raw)
			}
			if err != nil {
				return nil, fmt.Errorf("invalid target_date")
			}
			d := time.Date(parsed.Year(), parsed.Month(), parsed.Day(), 0, 0, 0, 0, time.UTC)
			g.TargetDate = &d
		}
	}

	err = s.pool.QueryRow(ctx, `
		UPDATE goals
		SET name=$2, target_amount=$3, current_amount=$4, target_date=$5, category=$6,
		    goal_type=$7, monthly_contribution=$8, priority=$9, updated_at=NOW()
		WHERE id=$1
		RETURNING id, person_id, name, target_amount, current_amount, target_date, category,
		          COALESCE(goal_type,'custom'), COALESCE(monthly_contribution,0), COALESCE(priority,3), created_at, updated_at
	`, g.ID, g.Name, g.TargetAmount, g.CurrentAmount, g.TargetDate, g.Category, g.GoalType, g.MonthlyContribution, g.Priority).Scan(
		&g.ID, &g.PersonID, &g.Name, &g.TargetAmount, &g.CurrentAmount, &g.TargetDate, &g.Category,
		&g.GoalType, &g.MonthlyContribution, &g.Priority, &g.CreatedAt, &g.UpdatedAt,
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

func (s *FinanceService) ListCashflow(ctx context.Context, q CashflowQuery) ([]models.CashflowEntry, error) {
	sql := `
		SELECT id, person_id, type, category, amount, entry_month, recurring, created_at, updated_at
		FROM cashflow_entries WHERE 1=1`
	args := []any{}
	n := 1

	if t := strings.TrimSpace(q.Type); t == "income" || t == "expense" {
		sql += fmt.Sprintf(` AND type=$%d`, n)
		args = append(args, t)
		n++
	}

	month := strings.TrimSpace(q.Month)
	from := strings.TrimSpace(q.From)
	to := strings.TrimSpace(q.To)
	if month != "" {
		if len(month) < 7 {
			return nil, fmt.Errorf("invalid month, use YYYY-MM")
		}
		month = month[:7]
		sql += fmt.Sprintf(` AND to_char(entry_month, 'YYYY-MM') = $%d`, n)
		args = append(args, month)
		n++
	} else {
		if from != "" {
			if len(from) < 7 {
				return nil, fmt.Errorf("invalid from, use YYYY-MM")
			}
			sql += fmt.Sprintf(` AND to_char(entry_month, 'YYYY-MM') >= $%d`, n)
			args = append(args, from[:7])
			n++
		}
		if to != "" {
			if len(to) < 7 {
				return nil, fmt.Errorf("invalid to, use YYYY-MM")
			}
			sql += fmt.Sprintf(` AND to_char(entry_month, 'YYYY-MM') <= $%d`, n)
			args = append(args, to[:7])
			n++
		}
	}

	sql += ` ORDER BY entry_month DESC, category ASC, created_at DESC LIMIT 1000`

	rows, err := s.pool.Query(ctx, sql, args...)
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
	if out == nil {
		out = []models.CashflowEntry{}
	}
	return out, rows.Err()
}

type CashflowQuery struct {
	Type  string // income | expense | ""
	From  string // YYYY-MM
	To    string // YYYY-MM
	Month string // YYYY-MM (single month shortcut)
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
	// Normalize to calendar month (DATE) — avoid timezone day-shifts
	month := time.Date(in.EntryMonth.UTC().Year(), in.EntryMonth.UTC().Month(), 1, 0, 0, 0, 0, time.UTC)
	if in.Type != "income" && in.Type != "expense" {
		return nil, fmt.Errorf("type must be income or expense")
	}
	if strings.TrimSpace(in.Category) == "" {
		return nil, fmt.Errorf("category is required")
	}
	var e models.CashflowEntry
	err := s.pool.QueryRow(ctx, `
		INSERT INTO cashflow_entries (person_id, type, category, amount, entry_month, recurring)
		VALUES ($1,$2,$3,$4,$5,$6)
		RETURNING id, person_id, type, category, amount, entry_month, recurring, created_at, updated_at
	`, in.PersonID, in.Type, strings.TrimSpace(in.Category), in.Amount, month, in.Recurring).Scan(
		&e.ID, &e.PersonID, &e.Type, &e.Category, &e.Amount, &e.EntryMonth, &e.Recurring, &e.CreatedAt, &e.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &e, nil
}

func (s *FinanceService) DeleteCashflow(ctx context.Context, id uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM cashflow_entries WHERE id=$1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("cashflow entry not found")
	}
	return nil
}

type CreatePolicyInput struct {
	PersonID         *uuid.UUID       `json:"person_id"`
	Insurer          string           `json:"insurer"`
	PolicyType       string           `json:"policy_type"`
	PremiumAmount    *decimal.Decimal `json:"premium_amount"`
	PremiumFrequency *string          `json:"premium_frequency"`
	SumAssured       *decimal.Decimal `json:"sum_assured"`
	StartDate        *time.Time       `json:"start_date"`
	EndDate          *time.Time       `json:"end_date"`
	NextDueDate      *time.Time       `json:"next_due_date"`
}

func (s *FinanceService) CreatePolicy(ctx context.Context, in CreatePolicyInput) (*models.Policy, error) {
	if in.Insurer == "" || in.PolicyType == "" {
		return nil, fmt.Errorf("insurer and policy_type required")
	}
	var p models.Policy
	err := s.pool.QueryRow(ctx, `
		INSERT INTO policies (person_id, insurer, policy_type, premium_amount, premium_frequency, sum_assured, start_date, end_date, next_due_date)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		RETURNING id, person_id, insurer, policy_type, premium_amount, premium_frequency, sum_assured,
		          start_date, end_date, next_due_date, status, created_at, updated_at
	`, in.PersonID, in.Insurer, in.PolicyType, in.PremiumAmount, in.PremiumFrequency, in.SumAssured, in.StartDate, in.EndDate, in.NextDueDate).Scan(
		&p.ID, &p.PersonID, &p.Insurer, &p.PolicyType, &p.PremiumAmount, &p.PremiumFrequency, &p.SumAssured,
		&p.StartDate, &p.EndDate, &p.NextDueDate, &p.Status, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (s *FinanceService) DeletePolicy(ctx context.Context, id uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM policies WHERE id=$1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("policy not found")
	}
	return nil
}

func parseDecimalAny(v any) (decimal.Decimal, error) {
	if v == nil {
		return decimal.Zero, nil
	}
	switch t := v.(type) {
	case float64:
		return decimal.NewFromFloat(t), nil
	case float32:
		return decimal.NewFromFloat32(t), nil
	case int:
		return decimal.NewFromInt(int64(t)), nil
	case int64:
		return decimal.NewFromInt(t), nil
	case json.Number:
		return decimal.NewFromString(t.String())
	case string:
		s := strings.TrimSpace(strings.ReplaceAll(t, ",", ""))
		if s == "" {
			return decimal.Zero, nil
		}
		return decimal.NewFromString(s)
	default:
		s := strings.TrimSpace(fmt.Sprint(t))
		if s == "" || s == "<nil>" {
			return decimal.Zero, nil
		}
		return decimal.NewFromString(s)
	}
}

func parseIntAny(v any, fallback int) int {
	if v == nil {
		return fallback
	}
	switch t := v.(type) {
	case float64:
		return int(t)
	case int:
		return t
	case int64:
		return int(t)
	case json.Number:
		n, err := t.Int64()
		if err != nil {
			return fallback
		}
		return int(n)
	case string:
		s := strings.TrimSpace(t)
		if s == "" {
			return fallback
		}
		n, err := strconv.Atoi(s)
		if err != nil {
			return fallback
		}
		return n
	default:
		return fallback
	}
}

func parseOptionalString(v any) *string {
	if v == nil {
		return nil
	}
	switch t := v.(type) {
	case string:
		s := strings.TrimSpace(t)
		if s == "" {
			return nil
		}
		return &s
	default:
		s := strings.TrimSpace(fmt.Sprint(t))
		if s == "" || s == "<nil>" {
			return nil
		}
		return &s
	}
}
