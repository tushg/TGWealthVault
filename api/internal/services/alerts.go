package services

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/tushg/TGWealthVault/api/internal/models"
)

type AlertService struct {
	pool *pgxpool.Pool
}

func NewAlertService(pool *pgxpool.Pool) *AlertService {
	return &AlertService{pool: pool}
}

func (s *AlertService) upsertOpen(ctx context.Context, a models.Alert) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO alerts (kind, severity, title, detail, href, reference_type, reference_id, dedupe_key, status)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'open')
		ON CONFLICT (dedupe_key) DO NOTHING
	`, a.Kind, a.Severity, a.Title, a.Detail, a.Href, a.ReferenceType, a.ReferenceID, a.DedupeKey)
	return err
}

// SyncDepositAlerts auto-matures FDs on/after maturity date and creates upcoming/matured alerts.
func (s *AlertService) SyncDepositAlerts(ctx context.Context) error {
	// 1) Auto-mature on maturity date (inclusive)
	rows, err := s.pool.Query(ctx, `
		SELECT id, type, bank_name, fd_number, principal, maturity_amount, maturity_date
		FROM deposits
		WHERE status = 'active' AND maturity_date::date <= CURRENT_DATE
	`)
	if err != nil {
		return err
	}
	type maturedRow struct {
		ID             uuid.UUID
		Type           string
		Bank           string
		FDNumber       *string
		Principal      string
		MaturityAmount *string
		MaturityDate   time.Time
	}
	var toMature []maturedRow
	for rows.Next() {
		var r maturedRow
		var principal, matAmt interface{}
		if err := rows.Scan(&r.ID, &r.Type, &r.Bank, &r.FDNumber, &principal, &matAmt, &r.MaturityDate); err != nil {
			rows.Close()
			return err
		}
		r.Principal = fmt.Sprint(principal)
		if matAmt != nil {
			s := fmt.Sprint(matAmt)
			r.MaturityAmount = &s
		}
		toMature = append(toMature, r)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	for _, r := range toMature {
		_, err := s.pool.Exec(ctx, `
			UPDATE deposits SET status = 'matured', updated_at = NOW() WHERE id = $1 AND status = 'active'
		`, r.ID)
		if err != nil {
			return err
		}
		fdNo := "—"
		if r.FDNumber != nil && *r.FDNumber != "" {
			fdNo = *r.FDNumber
		}
		matAmt := "not set"
		if r.MaturityAmount != nil {
			matAmt = "₹" + *r.MaturityAmount
		}
		detail := fmt.Sprintf(
			"%s at %s (No. %s) matured on %s. Principal ₹%s · Maturity amount %s. Moved to history and removed from portfolio assets.",
			r.Type, r.Bank, fdNo, r.MaturityDate.Format("02 Jan 2006"), r.Principal, matAmt,
		)
		refType := "deposit"
		href := "/deposits?status=matured"
		_ = s.upsertOpen(ctx, models.Alert{
			Kind:          "deposit_matured",
			Severity:      "critical",
			Title:         fmt.Sprintf("%s matured — %s", r.Type, r.Bank),
			Detail:        detail,
			Href:          &href,
			ReferenceType: &refType,
			ReferenceID:   &r.ID,
			DedupeKey:     fmt.Sprintf("deposit:%s:matured", r.ID.String()),
		})
	}

	// 2) Upcoming maturity alerts for still-active deposits inside alert window
	upcoming, err := s.pool.Query(ctx, `
		SELECT id, type, bank_name, fd_number, principal, maturity_amount, maturity_date, alert_days_before
		FROM deposits
		WHERE status = 'active'
		  AND maturity_date::date > CURRENT_DATE
		  AND maturity_date::date <= CURRENT_DATE + (COALESCE(alert_days_before, 14) || ' days')::interval
	`)
	if err != nil {
		return err
	}
	defer upcoming.Close()

	for upcoming.Next() {
		var (
			id             uuid.UUID
			typ, bank      string
			fdNumber       *string
			principal      interface{}
			matAmt         interface{}
			matDate        time.Time
			alertDays      int
		)
		if err := upcoming.Scan(&id, &typ, &bank, &fdNumber, &principal, &matAmt, &matDate, &alertDays); err != nil {
			return err
		}
		days := int(matDate.Sub(time.Now().Truncate(24*time.Hour)).Hours() / 24)
		if days < 0 {
			days = 0
		}
		fdNo := "—"
		if fdNumber != nil && *fdNumber != "" {
			fdNo = *fdNumber
		}
		matAmtStr := "not set"
		if matAmt != nil {
			matAmtStr = "₹" + fmt.Sprint(matAmt)
		}
		severity := "warn"
		if days <= 3 {
			severity = "critical"
		}
		detail := fmt.Sprintf(
			"%s at %s (No. %s) matures on %s (%d day(s) left). Principal ₹%s · Expected maturity %s.",
			typ, bank, fdNo, matDate.Format("02 Jan 2006"), days, fmt.Sprint(principal), matAmtStr,
		)
		refType := "deposit"
		href := "/deposits?status=active"
		_ = s.upsertOpen(ctx, models.Alert{
			Kind:          "deposit_upcoming",
			Severity:      severity,
			Title:         fmt.Sprintf("%s maturing soon — %s", typ, bank),
			Detail:        detail,
			Href:          &href,
			ReferenceType: &refType,
			ReferenceID:   &id,
			DedupeKey:     fmt.Sprintf("deposit:%s:upcoming", id.String()),
		})
	}
	return upcoming.Err()
}

func (s *AlertService) NotifyDepositMatured(ctx context.Context, d *models.Deposit) error {
	if d == nil {
		return nil
	}
	fdNo := "—"
	if d.FDNumber != nil && *d.FDNumber != "" {
		fdNo = *d.FDNumber
	}
	matAmt := "not set"
	if d.MaturityAmount != nil {
		matAmt = "₹" + d.MaturityAmount.String()
	}
	detail := fmt.Sprintf(
		"%s at %s (No. %s) marked matured on %s. Principal ₹%s · Maturity amount %s. Removed from portfolio assets.",
		d.Type, d.BankName, fdNo, d.MaturityDate.Format("02 Jan 2006"), d.Principal.String(), matAmt,
	)
	refType := "deposit"
	href := "/deposits?status=matured"
	return s.upsertOpen(ctx, models.Alert{
		Kind:          "deposit_matured",
		Severity:      "critical",
		Title:         fmt.Sprintf("%s matured — %s", d.Type, d.BankName),
		Detail:        detail,
		Href:          &href,
		ReferenceType: &refType,
		ReferenceID:   &d.ID,
		DedupeKey:     fmt.Sprintf("deposit:%s:matured", d.ID.String()),
	})
}

func (s *AlertService) List(ctx context.Context, status string) ([]models.Alert, error) {
	_ = s.SyncDepositAlerts(ctx)

	q := `
		SELECT id, kind, severity, title, detail, href, reference_type, reference_id, dedupe_key, status, created_at, confirmed_at
		FROM alerts`
	args := []any{}
	switch status {
	case "open", "confirmed":
		q += ` WHERE status = $1`
		args = append(args, status)
	}
	q += ` ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, created_at DESC LIMIT 200`

	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []models.Alert
	for rows.Next() {
		var a models.Alert
		if err := rows.Scan(&a.ID, &a.Kind, &a.Severity, &a.Title, &a.Detail, &a.Href, &a.ReferenceType, &a.ReferenceID,
			&a.DedupeKey, &a.Status, &a.CreatedAt, &a.ConfirmedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	if out == nil {
		out = []models.Alert{}
	}
	return out, rows.Err()
}

func (s *AlertService) CountOpen(ctx context.Context) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx, `SELECT COUNT(*) FROM alerts WHERE status = 'open'`).Scan(&n)
	return n, err
}

func (s *AlertService) Confirm(ctx context.Context, id uuid.UUID) (*models.Alert, error) {
	var a models.Alert
	err := s.pool.QueryRow(ctx, `
		UPDATE alerts SET status = 'confirmed', confirmed_at = NOW()
		WHERE id = $1
		RETURNING id, kind, severity, title, detail, href, reference_type, reference_id, dedupe_key, status, created_at, confirmed_at
	`, id).Scan(&a.ID, &a.Kind, &a.Severity, &a.Title, &a.Detail, &a.Href, &a.ReferenceType, &a.ReferenceID,
		&a.DedupeKey, &a.Status, &a.CreatedAt, &a.ConfirmedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("alert not found")
		}
		return nil, err
	}
	return &a, nil
}
