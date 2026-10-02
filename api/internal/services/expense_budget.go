package services

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

type ExpenseBudget struct {
	ID               uuid.UUID       `json:"id"`
	Name             string          `json:"name"`
	AllocatedAmount  decimal.Decimal `json:"allocated_amount"`
	Notes            *string         `json:"notes,omitempty"`
	Active           bool            `json:"active"`
	SortOrder        int             `json:"sort_order"`
	CreatedAt        time.Time       `json:"created_at"`
	UpdatedAt        time.Time       `json:"updated_at"`
}

type CreateExpenseBudgetInput struct {
	Name            string          `json:"name"`
	AllocatedAmount decimal.Decimal `json:"allocated_amount"`
	Notes           *string         `json:"notes"`
	Active          *bool           `json:"active"`
	SortOrder       int             `json:"sort_order"`
}

type UpdateExpenseBudgetInput struct {
	Name            *string          `json:"name"`
	AllocatedAmount *decimal.Decimal `json:"allocated_amount"`
	Notes           *string          `json:"notes"`
	Active          *bool            `json:"active"`
	SortOrder       *int             `json:"sort_order"`
}

type ExpenseDeviation struct {
	BudgetID        uuid.UUID       `json:"budget_id"`
	Name            string          `json:"name"`
	BudgetAmount    decimal.Decimal `json:"budget_amount"`
	ActualAmount    decimal.Decimal `json:"actual_amount"`
	Deviation       decimal.Decimal `json:"deviation"`
	DeviationPct    decimal.Decimal `json:"deviation_pct"`
	AbsDeviation    decimal.Decimal `json:"abs_deviation"`
}

type ExpenseGrowth struct {
	BudgetID       uuid.UUID       `json:"budget_id"`
	Name           string          `json:"name"`
	FirstAmount    decimal.Decimal `json:"first_amount"`
	LastAmount     decimal.Decimal `json:"last_amount"`
	AbsoluteGrowth decimal.Decimal `json:"absolute_growth"`
	GrowthPct      decimal.Decimal `json:"growth_pct"`
	Direction      string          `json:"direction"` // up | down | flat
}

type ExpenseTrendSeries struct {
	Name   string            `json:"name"`
	Points []decimal.Decimal `json:"points"`
}

type ExpenseTrend struct {
	Buckets []string             `json:"buckets"`
	Totals  []decimal.Decimal    `json:"totals"`
	Series  []ExpenseTrendSeries `json:"series"`
}

type ExpenseReport struct {
	Period         string              `json:"period"`
	Label          string              `json:"label"`
	From           string              `json:"from"`
	To             string              `json:"to"`
	Year           int                 `json:"year"`
	Month          *int                `json:"month,omitempty"`
	MonthsCovered  int                 `json:"months_covered"`
	TotalBudget    decimal.Decimal     `json:"total_budget"`
	TotalActual    decimal.Decimal     `json:"total_actual"`
	TotalDeviation decimal.Decimal     `json:"total_deviation"`
	Items          []ExpenseDeviation  `json:"items"`
	TopDeviations  []ExpenseDeviation  `json:"top_deviations"`
	Trend          ExpenseTrend        `json:"trend"`
	Growth         []ExpenseGrowth     `json:"growth"`
	TopGrowing     []ExpenseGrowth     `json:"top_growing"`
	History        []string            `json:"history"`
}

type ExpenseReportQuery struct {
	Period string
	From   string
	To     string
	Year   int
	Month  *int
}

func (s *FinanceService) ListExpenseBudgets(ctx context.Context) ([]ExpenseBudget, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, name, allocated_amount, notes, active, sort_order, created_at, updated_at
		FROM expense_budgets
		ORDER BY sort_order ASC, name ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ExpenseBudget
	for rows.Next() {
		var b ExpenseBudget
		if err := rows.Scan(&b.ID, &b.Name, &b.AllocatedAmount, &b.Notes, &b.Active, &b.SortOrder, &b.CreatedAt, &b.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	if out == nil {
		out = []ExpenseBudget{}
	}
	return out, rows.Err()
}

func (s *FinanceService) CreateExpenseBudget(ctx context.Context, in CreateExpenseBudgetInput) (*ExpenseBudget, error) {
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return nil, fmt.Errorf("name is required")
	}
	if in.AllocatedAmount.IsNegative() {
		return nil, fmt.Errorf("allocated_amount cannot be negative")
	}
	active := true
	if in.Active != nil {
		active = *in.Active
	}
	var b ExpenseBudget
	err := s.pool.QueryRow(ctx, `
		INSERT INTO expense_budgets (name, allocated_amount, notes, active, sort_order)
		VALUES ($1,$2,$3,$4,$5)
		RETURNING id, name, allocated_amount, notes, active, sort_order, created_at, updated_at
	`, name, in.AllocatedAmount, in.Notes, active, in.SortOrder).Scan(
		&b.ID, &b.Name, &b.AllocatedAmount, &b.Notes, &b.Active, &b.SortOrder, &b.CreatedAt, &b.UpdatedAt,
	)
	if err != nil {
		if strings.Contains(err.Error(), "expense_budgets_name_unique") || strings.Contains(err.Error(), "duplicate key") {
			return nil, fmt.Errorf("expense '%s' already exists", name)
		}
		return nil, err
	}
	return &b, nil
}

func (s *FinanceService) UpdateExpenseBudget(ctx context.Context, id uuid.UUID, in UpdateExpenseBudgetInput) (*ExpenseBudget, error) {
	cur, err := s.getExpenseBudget(ctx, id)
	if err != nil {
		return nil, err
	}
	if in.Name != nil {
		cur.Name = strings.TrimSpace(*in.Name)
		if cur.Name == "" {
			return nil, fmt.Errorf("name is required")
		}
	}
	if in.AllocatedAmount != nil {
		if in.AllocatedAmount.IsNegative() {
			return nil, fmt.Errorf("allocated_amount cannot be negative")
		}
		cur.AllocatedAmount = *in.AllocatedAmount
	}
	if in.Notes != nil {
		cur.Notes = in.Notes
	}
	if in.Active != nil {
		cur.Active = *in.Active
	}
	if in.SortOrder != nil {
		cur.SortOrder = *in.SortOrder
	}
	err = s.pool.QueryRow(ctx, `
		UPDATE expense_budgets
		SET name=$2, allocated_amount=$3, notes=$4, active=$5, sort_order=$6, updated_at=NOW()
		WHERE id=$1
		RETURNING id, name, allocated_amount, notes, active, sort_order, created_at, updated_at
	`, id, cur.Name, cur.AllocatedAmount, cur.Notes, cur.Active, cur.SortOrder).Scan(
		&cur.ID, &cur.Name, &cur.AllocatedAmount, &cur.Notes, &cur.Active, &cur.SortOrder, &cur.CreatedAt, &cur.UpdatedAt,
	)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			return nil, fmt.Errorf("expense '%s' already exists", cur.Name)
		}
		return nil, err
	}
	return cur, nil
}

func (s *FinanceService) DeleteExpenseBudget(ctx context.Context, id uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM expense_budgets WHERE id=$1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("expense budget not found")
	}
	return nil
}

func (s *FinanceService) getExpenseBudget(ctx context.Context, id uuid.UUID) (*ExpenseBudget, error) {
	var b ExpenseBudget
	err := s.pool.QueryRow(ctx, `
		SELECT id, name, allocated_amount, notes, active, sort_order, created_at, updated_at
		FROM expense_budgets WHERE id=$1
	`, id).Scan(&b.ID, &b.Name, &b.AllocatedAmount, &b.Notes, &b.Active, &b.SortOrder, &b.CreatedAt, &b.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("expense budget not found")
	}
	return &b, nil
}

func (s *FinanceService) ExpenseReport(ctx context.Context, q ExpenseReportQuery) (*ExpenseReport, error) {
	period := strings.ToLower(strings.TrimSpace(q.Period))
	if period != "yearly" {
		period = "monthly"
	}

	start, endExclusive, fromLabel, toLabel, err := resolveExpenseRange(q, period)
	if err != nil {
		return nil, err
	}
	if !endExclusive.After(start) {
		return nil, fmt.Errorf("to must be after from")
	}

	monthsCovered := monthsBetween(start, endExclusive)
	if monthsCovered < 1 {
		monthsCovered = 1
	}

	budgets, err := s.ListExpenseBudgets(ctx)
	if err != nil {
		return nil, err
	}
	activeBudgets := make([]ExpenseBudget, 0, len(budgets))
	for _, b := range budgets {
		if b.Active {
			activeBudgets = append(activeBudgets, b)
		}
	}

	rows, err := s.pool.Query(ctx, `
		SELECT LOWER(TRIM(category)) AS cat, COALESCE(SUM(amount),0)
		FROM cashflow_entries
		WHERE type='expense' AND entry_month >= $1 AND entry_month < $2
		GROUP BY LOWER(TRIM(category))
	`, start, endExclusive)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	actuals := map[string]decimal.Decimal{}
	for rows.Next() {
		var cat string
		var amt decimal.Decimal
		if err := rows.Scan(&cat, &amt); err != nil {
			return nil, err
		}
		actuals[cat] = amt
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	multiplier := decimal.NewFromInt(int64(monthsCovered))
	label := fromLabel
	if fromLabel != toLabel {
		label = fromLabel + " → " + toLabel
	}

	report := &ExpenseReport{
		Period:        period,
		Label:         label,
		From:          fromLabel,
		To:            toLabel,
		Year:          start.Year(),
		MonthsCovered: monthsCovered,
		Items:         []ExpenseDeviation{},
		TopDeviations: []ExpenseDeviation{},
		Growth:        []ExpenseGrowth{},
		TopGrowing:    []ExpenseGrowth{},
		Trend: ExpenseTrend{
			Buckets: []string{},
			Totals:  []decimal.Decimal{},
			Series:  []ExpenseTrendSeries{},
		},
	}
	if period == "monthly" {
		m := int(start.Month())
		report.Month = &m
	}

	for _, b := range activeBudgets {
		budgetAmt := b.AllocatedAmount.Mul(multiplier)
		actual := actuals[strings.ToLower(strings.TrimSpace(b.Name))]
		dev := actual.Sub(budgetAmt)
		pct := decimal.Zero
		if !budgetAmt.IsZero() {
			pct = dev.Mul(decimal.NewFromInt(100)).Div(budgetAmt).Round(2)
		} else if !actual.IsZero() {
			pct = decimal.NewFromInt(100)
		}
		item := ExpenseDeviation{
			BudgetID:     b.ID,
			Name:         b.Name,
			BudgetAmount: budgetAmt,
			ActualAmount: actual,
			Deviation:    dev,
			DeviationPct: pct,
			AbsDeviation: dev.Abs(),
		}
		report.Items = append(report.Items, item)
		report.TotalBudget = report.TotalBudget.Add(budgetAmt)
		report.TotalActual = report.TotalActual.Add(actual)
	}
	report.TotalDeviation = report.TotalActual.Sub(report.TotalBudget)

	sorted := append([]ExpenseDeviation{}, report.Items...)
	for i := 0; i < len(sorted); i++ {
		for j := i + 1; j < len(sorted); j++ {
			if sorted[j].AbsDeviation.GreaterThan(sorted[i].AbsDeviation) {
				sorted[i], sorted[j] = sorted[j], sorted[i]
			}
		}
	}
	limit := 3
	if len(sorted) < limit {
		limit = len(sorted)
	}
	report.TopDeviations = sorted[:limit]

	trend, growth, err := s.buildExpenseTrendGrowth(ctx, period, start, endExclusive, activeBudgets)
	if err != nil {
		return nil, err
	}
	report.Trend = trend
	report.Growth = growth
	growing := append([]ExpenseGrowth{}, growth...)
	for i := 0; i < len(growing); i++ {
		for j := i + 1; j < len(growing); j++ {
			if growing[j].AbsoluteGrowth.GreaterThan(growing[i].AbsoluteGrowth) {
				growing[i], growing[j] = growing[j], growing[i]
			}
		}
	}
	gLimit := 5
	if len(growing) < gLimit {
		gLimit = len(growing)
	}
	report.TopGrowing = growing[:gLimit]

	history, _ := s.expenseReportHistory(ctx)
	report.History = history
	return report, nil
}

func resolveExpenseRange(q ExpenseReportQuery, period string) (start, endExclusive time.Time, fromLabel, toLabel string, err error) {
	now := time.Now()
	from := strings.TrimSpace(q.From)
	to := strings.TrimSpace(q.To)

	if from == "" && to == "" {
		year := q.Year
		if year <= 0 {
			year = now.Year()
		}
		if period == "yearly" {
			start = time.Date(year, 1, 1, 0, 0, 0, 0, time.Local)
			endExclusive = time.Date(year+1, 1, 1, 0, 0, 0, 0, time.Local)
			fromLabel = fmt.Sprintf("%d", year)
			toLabel = fromLabel
			return
		}
		month := now.Month()
		if q.Month != nil && *q.Month >= 1 && *q.Month <= 12 {
			month = time.Month(*q.Month)
		}
		start = time.Date(year, month, 1, 0, 0, 0, 0, time.Local)
		endExclusive = start.AddDate(0, 1, 0)
		fromLabel = start.Format("2006-01")
		toLabel = fromLabel
		return
	}

	if from == "" {
		from = to
	}
	if to == "" {
		to = from
	}

	start, fromLabel, err = parseExpenseBound(from, false, period)
	if err != nil {
		return time.Time{}, time.Time{}, "", "", fmt.Errorf("invalid from: %w", err)
	}
	endStart, toLabel, err := parseExpenseBound(to, true, period)
	if err != nil {
		return time.Time{}, time.Time{}, "", "", fmt.Errorf("invalid to: %w", err)
	}
	if period == "yearly" {
		endExclusive = endStart.AddDate(1, 0, 0)
	} else {
		endExclusive = endStart.AddDate(0, 1, 0)
	}
	return start, endExclusive, fromLabel, toLabel, nil
}

func parseExpenseBound(raw string, isEnd bool, period string) (time.Time, string, error) {
	raw = strings.TrimSpace(raw)
	if len(raw) == 4 {
		y, err := strconv.Atoi(raw)
		if err != nil {
			return time.Time{}, "", err
		}
		t := time.Date(y, 1, 1, 0, 0, 0, 0, time.Local)
		return t, fmt.Sprintf("%d", y), nil
	}
	if len(raw) >= 7 {
		t, err := time.ParseInLocation("2006-01", raw[:7], time.Local)
		if err != nil {
			return time.Time{}, "", err
		}
		if period == "yearly" {
			return time.Date(t.Year(), 1, 1, 0, 0, 0, 0, time.Local), fmt.Sprintf("%d", t.Year()), nil
		}
		_ = isEnd
		return t, t.Format("2006-01"), nil
	}
	return time.Time{}, "", fmt.Errorf("use YYYY or YYYY-MM")
}

func monthsBetween(start, endExclusive time.Time) int {
	y1, m1, _ := start.Date()
	y2, m2, _ := endExclusive.Date()
	return (y2-y1)*12 + int(m2-m1)
}

func (s *FinanceService) buildExpenseTrendGrowth(
	ctx context.Context,
	period string,
	start, endExclusive time.Time,
	budgets []ExpenseBudget,
) (ExpenseTrend, []ExpenseGrowth, error) {
	trend := ExpenseTrend{Buckets: []string{}, Totals: []decimal.Decimal{}, Series: []ExpenseTrendSeries{}}
	growth := []ExpenseGrowth{}
	if len(budgets) == 0 {
		return trend, growth, nil
	}

	var bucketExpr string
	if period == "yearly" {
		bucketExpr = `TO_CHAR(entry_month, 'YYYY')`
	} else {
		bucketExpr = `TO_CHAR(entry_month, 'YYYY-MM')`
	}

	rows, err := s.pool.Query(ctx, fmt.Sprintf(`
		SELECT %s AS bucket, LOWER(TRIM(category)) AS cat, COALESCE(SUM(amount),0)
		FROM cashflow_entries
		WHERE type='expense' AND entry_month >= $1 AND entry_month < $2
		GROUP BY bucket, cat
		ORDER BY bucket
	`, bucketExpr), start, endExclusive)
	if err != nil {
		return trend, growth, err
	}
	defer rows.Close()

	bucketSet := map[string]bool{}
	var bucketOrder []string
	matrix := map[string]map[string]decimal.Decimal{} // cat -> bucket -> amt
	for rows.Next() {
		var bucket, cat string
		var amt decimal.Decimal
		if err := rows.Scan(&bucket, &cat, &amt); err != nil {
			return trend, growth, err
		}
		if !bucketSet[bucket] {
			bucketSet[bucket] = true
			bucketOrder = append(bucketOrder, bucket)
		}
		if matrix[cat] == nil {
			matrix[cat] = map[string]decimal.Decimal{}
		}
		matrix[cat][bucket] = amt
	}
	if err := rows.Err(); err != nil {
		return trend, growth, err
	}

	// Ensure contiguous buckets even if some months have no spend
	bucketOrder = enumerateBuckets(start, endExclusive, period)
	trend.Buckets = bucketOrder
	trend.Totals = make([]decimal.Decimal, len(bucketOrder))

	for _, b := range budgets {
		key := strings.ToLower(strings.TrimSpace(b.Name))
		points := make([]decimal.Decimal, len(bucketOrder))
		for i, bucket := range bucketOrder {
			amt := decimal.Zero
			if matrix[key] != nil {
				amt = matrix[key][bucket]
			}
			points[i] = amt
			trend.Totals[i] = trend.Totals[i].Add(amt)
		}
		trend.Series = append(trend.Series, ExpenseTrendSeries{Name: b.Name, Points: points})

		first, last := firstLastNonZero(points)
		if first.IsZero() && last.IsZero() {
			// still include flat zero for completeness? skip empty categories
			continue
		}
		absGrowth := last.Sub(first)
		pct := decimal.Zero
		if !first.IsZero() {
			pct = absGrowth.Mul(decimal.NewFromInt(100)).Div(first).Round(1)
		} else if !last.IsZero() {
			pct = decimal.NewFromInt(100)
		}
		dir := "flat"
		if absGrowth.GreaterThan(decimal.Zero) {
			dir = "up"
		} else if absGrowth.LessThan(decimal.Zero) {
			dir = "down"
		}
		growth = append(growth, ExpenseGrowth{
			BudgetID:       b.ID,
			Name:           b.Name,
			FirstAmount:    first,
			LastAmount:     last,
			AbsoluteGrowth: absGrowth,
			GrowthPct:      pct,
			Direction:      dir,
		})
	}
	return trend, growth, nil
}

func enumerateBuckets(start, endExclusive time.Time, period string) []string {
	var out []string
	cur := start
	for cur.Before(endExclusive) {
		if period == "yearly" {
			out = append(out, fmt.Sprintf("%d", cur.Year()))
			cur = cur.AddDate(1, 0, 0)
		} else {
			out = append(out, cur.Format("2006-01"))
			cur = cur.AddDate(0, 1, 0)
		}
		if len(out) > 120 {
			break
		}
	}
	return out
}

func firstLastNonZero(points []decimal.Decimal) (first, last decimal.Decimal) {
	if len(points) == 0 {
		return decimal.Zero, decimal.Zero
	}
	firstIdx, lastIdx := -1, -1
	for i, p := range points {
		if !p.IsZero() {
			if firstIdx < 0 {
				firstIdx = i
			}
			lastIdx = i
		}
	}
	if firstIdx < 0 {
		return points[0], points[len(points)-1]
	}
	return points[firstIdx], points[lastIdx]
}

func (s *FinanceService) expenseReportHistory(ctx context.Context) ([]string, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT DISTINCT TO_CHAR(entry_month, 'YYYY-MM') AS ym
		FROM cashflow_entries
		WHERE type='expense'
		ORDER BY ym DESC
		LIMIT 36
	`)
	if err != nil {
		return []string{}, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var ym string
		if err := rows.Scan(&ym); err != nil {
			return out, err
		}
		out = append(out, ym)
	}
	if out == nil {
		out = []string{}
	}
	return out, rows.Err()
}

// SeedExpenseDemoData inserts sample budgets + multi-month expenses for report demos.
func (s *FinanceService) SeedExpenseDemoData(ctx context.Context) (map[string]int, error) {
	type budgetSeed struct {
		Name   string
		Amount string
		Notes  string
		Order  int
	}
	budgets := []budgetSeed{
		{"School fees", "15000", "Tuition & books", 1},
		{"RD", "5000", "Recurring deposit", 2},
		{"Medicine", "3000", "Pharmacy & clinic", 3},
		{"Vegetable", "4000", "Groceries & veggies", 4},
		{"Fuel", "6000", "Petrol / CNG", 5},
		{"Utilities", "4500", "Electricity + water + internet", 6},
	}

	budgetCount := 0
	for _, b := range budgets {
		tag, err := s.pool.Exec(ctx, `
			INSERT INTO expense_budgets (name, allocated_amount, notes, active, sort_order)
			VALUES ($1,$2::numeric,$3,TRUE,$4)
			ON CONFLICT (name) DO UPDATE
			SET allocated_amount = EXCLUDED.allocated_amount,
			    notes = EXCLUDED.notes,
			    active = TRUE,
			    sort_order = EXCLUDED.sort_order,
			    updated_at = NOW()
		`, b.Name, b.Amount, b.Notes, b.Order)
		if err != nil {
			return nil, err
		}
		if tag.RowsAffected() > 0 {
			budgetCount++
		}
	}

	// Clear previous demo-tagged expenses so re-seed is clean
	_, _ = s.pool.Exec(ctx, `
		DELETE FROM cashflow_entries
		WHERE type='expense' AND category LIKE 'DEMO:%'
	`)
	// Also replace matching demo category names without prefix (legacy)
	_, _ = s.pool.Exec(ctx, `
		DELETE FROM cashflow_entries
		WHERE type='expense'
		  AND category IN ('School fees','RD','Medicine','Vegetable','Fuel','Utilities')
		  AND entry_month >= DATE_TRUNC('month', NOW() - INTERVAL '14 months')
	`)

	// Patterns: some rising, some flat, some falling — last 14 months including current
	type pattern struct {
		Name   string
		Base   float64
		Slope  float64 // monthly change
		Noise  []float64
	}
	patterns := []pattern{
		{"School fees", 14000, 450, []float64{0, 200, -100, 300, 0, 500, 200, 400, 100, 600, 300, 800, 400, 900}},
		{"RD", 5000, 0, []float64{0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0}},
		{"Medicine", 2800, 120, []float64{100, -50, 200, 0, 150, 80, 220, 50, 300, 100, 250, 180, 400, 350}},
		{"Vegetable", 4200, -40, []float64{100, -80, 50, -120, 0, -60, 40, -100, 20, -150, 0, -80, 30, -50}},
		{"Fuel", 5500, 180, []float64{0, 200, -100, 300, 100, 400, 200, 500, 150, 600, 300, 700, 250, 800}},
		{"Utilities", 4300, 30, []float64{50, -20, 80, 0, 40, 100, -30, 60, 20, 90, 10, 70, 40, 110}},
	}

	now := time.Now()
	start := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.Local).AddDate(0, -13, 0)
	inserted := 0
	for mi := 0; mi < 14; mi++ {
		month := start.AddDate(0, mi, 0)
		for _, p := range patterns {
			noise := 0.0
			if mi < len(p.Noise) {
				noise = p.Noise[mi]
			}
			amt := p.Base + p.Slope*float64(mi) + noise
			if amt < 500 {
				amt = 500
			}
			_, err := s.pool.Exec(ctx, `
				INSERT INTO cashflow_entries (type, category, amount, entry_month, recurring)
				VALUES ('expense', $1, $2, $3, TRUE)
			`, p.Name, decimal.NewFromFloat(amt).Round(2), month)
			if err != nil {
				return nil, err
			}
			inserted++
		}
	}

	// A couple of income rows so cashflow page isn't expense-only
	for mi := 0; mi < 3; mi++ {
		month := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.Local).AddDate(0, -mi, 0)
		_, _ = s.pool.Exec(ctx, `
			INSERT INTO cashflow_entries (type, category, amount, entry_month, recurring)
			VALUES ('income', 'Salary', 120000, $1, TRUE)
		`, month)
	}

	return map[string]int{
		"budgets_upserted": budgetCount,
		"expenses_inserted": inserted,
		"months":           14,
	}, nil
}
