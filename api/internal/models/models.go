package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

type User struct {
	ID           uuid.UUID `json:"id"`
	Email        string    `json:"email"`
	Name         string    `json:"name"`
	PasswordHash string    `json:"-"`
	Role         string    `json:"role"`
	MFASecretEnc *string   `json:"-"`
	MFAEnabled   bool      `json:"mfa_enabled"`
	IsActive     bool      `json:"is_active"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type Session struct {
	ID          uuid.UUID
	UserID      uuid.UUID
	TokenHash   string
	MFAVerified bool
	ExpiresAt   time.Time
	CreatedAt   time.Time
	UserAgent   *string
	IPHash      *string
}

type Person struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	Relation  *string   `json:"relation,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Deposit struct {
	ID              uuid.UUID        `json:"id"`
	PersonID        *uuid.UUID       `json:"person_id,omitempty"`
	Type            string           `json:"type"`
	BankName        string           `json:"bank_name"`
	FDNumber        *string          `json:"fd_number,omitempty"`
	Principal       decimal.Decimal  `json:"principal"`
	InterestRate    decimal.Decimal  `json:"interest_rate"`
	StartDate       time.Time        `json:"start_date"`
	MaturityDate    time.Time        `json:"maturity_date"`
	MaturityAmount  *decimal.Decimal `json:"maturity_amount,omitempty"`
	Compounding     *string          `json:"compounding,omitempty"`
	Status          string           `json:"status"`
	AlertDaysBefore int              `json:"alert_days_before"`
	CreatedAt       time.Time        `json:"created_at"`
	UpdatedAt       time.Time        `json:"updated_at"`
}

type MFHolding struct {
	ID             uuid.UUID        `json:"id"`
	PersonID       *uuid.UUID       `json:"person_id,omitempty"`
	AMC            *string          `json:"amc,omitempty"`
	SchemeName     string           `json:"scheme_name"`
	SchemeCode     *string          `json:"scheme_code,omitempty"`
	Units          decimal.Decimal  `json:"units"`
	NAV            *decimal.Decimal `json:"nav,omitempty"`
	NAVDate        *time.Time       `json:"nav_date,omitempty"`
	InvestedAmount *decimal.Decimal `json:"invested_amount,omitempty"`
	CurrentValue   *decimal.Decimal `json:"current_value,omitempty"`
	Category       *string          `json:"category,omitempty"`
	Source         string           `json:"source"`
	CreatedAt      time.Time        `json:"created_at"`
	UpdatedAt      time.Time        `json:"updated_at"`
}

type Goal struct {
	ID                  uuid.UUID        `json:"id"`
	PersonID            *uuid.UUID       `json:"person_id,omitempty"`
	Name                string           `json:"name"`
	TargetAmount        decimal.Decimal  `json:"target_amount"`
	CurrentAmount       decimal.Decimal  `json:"current_amount"`
	TargetDate          *time.Time       `json:"target_date,omitempty"`
	Category            *string          `json:"category,omitempty"`
	GoalType            string           `json:"goal_type"`
	MonthlyContribution decimal.Decimal  `json:"monthly_contribution"`
	Priority            int              `json:"priority"`
	CreatedAt           time.Time        `json:"created_at"`
	UpdatedAt           time.Time        `json:"updated_at"`
}

type Policy struct {
	ID               uuid.UUID        `json:"id"`
	PersonID         *uuid.UUID       `json:"person_id,omitempty"`
	Insurer          string           `json:"insurer"`
	PolicyType       string           `json:"policy_type"`
	PremiumAmount    *decimal.Decimal `json:"premium_amount,omitempty"`
	PremiumFrequency *string          `json:"premium_frequency,omitempty"`
	SumAssured       *decimal.Decimal `json:"sum_assured,omitempty"`
	StartDate        *time.Time       `json:"start_date,omitempty"`
	EndDate          *time.Time       `json:"end_date,omitempty"`
	NextDueDate      *time.Time       `json:"next_due_date,omitempty"`
	Status           string           `json:"status"`
	CreatedAt        time.Time        `json:"created_at"`
	UpdatedAt        time.Time        `json:"updated_at"`
}

type CashflowEntry struct {
	ID         uuid.UUID       `json:"id"`
	PersonID   *uuid.UUID      `json:"person_id,omitempty"`
	Type       string          `json:"type"`
	Category   string          `json:"category"`
	Amount     decimal.Decimal `json:"amount"`
	EntryMonth time.Time       `json:"entry_month"`
	Recurring  bool            `json:"recurring"`
	CreatedAt  time.Time       `json:"created_at"`
	UpdatedAt  time.Time       `json:"updated_at"`
}

type DashboardSummary struct {
	TotalDeposits      decimal.Decimal `json:"total_deposits"`
	TotalMFValue       decimal.Decimal `json:"total_mf_value"`
	TotalGoalsTarget   decimal.Decimal `json:"total_goals_target"`
	TotalGoalsSaved    decimal.Decimal `json:"total_goals_saved"`
	MonthIncome        decimal.Decimal `json:"month_income"`
	MonthExpense       decimal.Decimal `json:"month_expense"`
	UpcomingMaturities int             `json:"upcoming_maturities"`
	ActivePolicies     int             `json:"active_policies"`
}

type AllocationSlice struct {
	Name   string          `json:"name"`
	Value  decimal.Decimal `json:"value"`
	Weight decimal.Decimal `json:"weight"`
}

type ActionItem struct {
	Kind     string `json:"kind"`
	Title    string `json:"title"`
	Detail   string `json:"detail"`
	Severity string `json:"severity"` // info | warn | critical
	Href     string `json:"href"`
}

type PortfolioOverview struct {
	NetWorth           decimal.Decimal   `json:"net_worth"`
	TotalDeposits      decimal.Decimal   `json:"total_deposits"`
	TotalMFValue       decimal.Decimal   `json:"total_mf_value"`
	TotalGoalsTarget   decimal.Decimal   `json:"total_goals_target"`
	TotalGoalsSaved    decimal.Decimal   `json:"total_goals_saved"`
	GoalFundingPct     decimal.Decimal   `json:"goal_funding_pct"`
	MonthIncome        decimal.Decimal   `json:"month_income"`
	MonthExpense       decimal.Decimal   `json:"month_expense"`
	MonthSurplus       decimal.Decimal   `json:"month_surplus"`
	UpcomingMaturities int               `json:"upcoming_maturities"`
	ActivePolicies     int               `json:"active_policies"`
	MFCount            int               `json:"mf_count"`
	OpenAlerts         int               `json:"open_alerts"`
	Allocation         []AllocationSlice `json:"allocation"`
	Actions            []ActionItem      `json:"actions"`
	TopHoldings        []MFHolding       `json:"top_holdings"`
	Goals              []Goal            `json:"goals"`
}

type Alert struct {
	ID            uuid.UUID  `json:"id"`
	Kind          string     `json:"kind"`
	Severity      string     `json:"severity"`
	Title         string     `json:"title"`
	Detail        string     `json:"detail"`
	Href          *string    `json:"href,omitempty"`
	ReferenceType *string    `json:"reference_type,omitempty"`
	ReferenceID   *uuid.UUID `json:"reference_id,omitempty"`
	DedupeKey     string     `json:"dedupe_key"`
	Status        string     `json:"status"`
	CreatedAt     time.Time  `json:"created_at"`
	ConfirmedAt   *time.Time `json:"confirmed_at,omitempty"`
}
