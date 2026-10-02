package services

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"

	"github.com/tushg/TGWealthVault/api/internal/crypto"
	"github.com/tushg/TGWealthVault/api/internal/mfparse"
	"github.com/tushg/TGWealthVault/api/internal/models"
)

type MFService struct {
	pool       *pgxpool.Pool
	box        *crypto.Box
	uploadDir  string
}

func NewMFService(pool *pgxpool.Pool, box *crypto.Box, uploadDir string) *MFService {
	_ = os.MkdirAll(uploadDir, 0o700)
	return &MFService{pool: pool, box: box, uploadDir: uploadDir}
}

type ImportResult struct {
	StatementID      uuid.UUID         `json:"statement_id"`
	Source           string            `json:"source"`
	HoldingsImported int               `json:"holdings_imported"`
	Status           string            `json:"status"`
	Holdings         []models.MFHolding `json:"holdings,omitempty"`
	Notes            string            `json:"notes,omitempty"`
}

func (s *MFService) ImportStatement(ctx context.Context, personID *uuid.UUID, source, filename, password string, fileBytes []byte, textFallback string) (*ImportResult, error) {
	if source == "" {
		source = mfparse.DetectSource(filename, textFallback)
	}
	if source != "cams" && source != "kfin" {
		source = "cams"
	}

	encPDF, err := s.box.Encrypt(fileBytes)
	if err != nil {
		return nil, err
	}
	id := uuid.New()
	storageName := id.String() + ".enc"
	storagePath := filepath.Join(s.uploadDir, storageName)
	if err := os.WriteFile(storagePath, []byte(encPDF), 0o600); err != nil {
		return nil, err
	}

	var pwdEnc *string
	if password != "" {
		e, err := s.box.EncryptString(password)
		if err != nil {
			return nil, err
		}
		pwdEnc = &e
	}

	_, err = s.pool.Exec(ctx, `
		INSERT INTO mf_statements (id, person_id, source, filename, storage_path, password_hint_enc, status)
		VALUES ($1,$2,$3,$4,$5,$6,'uploaded')
	`, id, personID, source, filename, storagePath, pwdEnc)
	if err != nil {
		return nil, err
	}

	var holdings []mfparse.Holding
	notes := ""

	lower := strings.ToLower(filename)
	if strings.HasSuffix(lower, ".csv") || strings.HasSuffix(lower, ".txt") {
		holdings = mfparse.ParseCSV(string(fileBytes))
		if len(holdings) == 0 {
			holdings = mfparse.ParseCASText(string(fileBytes), source)
		}
	} else if textFallback != "" {
		if strings.Contains(textFallback, ",") && strings.Contains(strings.ToLower(textFallback), "scheme") {
			holdings = mfparse.ParseCSV(textFallback)
		} else {
			holdings = mfparse.ParseCASText(textFallback, source)
		}
		notes = "Parsed from pasted statement text (PDF binary not OCR'd)."
	} else {
		// Attempt naive string scan of PDF bytes for embedded text streams
		extracted := extractPDFStrings(fileBytes)
		if password != "" {
			notes = "Password stored encrypted. "
		}
		if extracted != "" {
			holdings = mfparse.ParseCASText(extracted, source)
			notes += "Parsed embedded PDF text heuristically."
		} else {
			notes += "No extractable text in PDF. Paste CAS text or upload CSV export from CAMS/KFin."
		}
	}

	if len(holdings) == 0 {
		_, _ = s.pool.Exec(ctx, `
			UPDATE mf_statements SET status='failed', error_message=$2, parse_notes=$3, parsed_at=NOW() WHERE id=$1
		`, id, "no holdings detected", notes)
		return &ImportResult{
			StatementID: id,
			Source:      source,
			Status:      "failed",
			Notes:       notes,
		}, nil
	}

	imported := 0
	var saved []models.MFHolding
	for _, h := range holdings {
		mh, err := s.upsertHolding(ctx, personID, source, h)
		if err != nil {
			continue
		}
		imported++
		saved = append(saved, *mh)
	}

	status := "parsed"
	_, _ = s.pool.Exec(ctx, `
		UPDATE mf_statements SET status=$2, holdings_imported=$3, parse_notes=$4, parsed_at=NOW(), error_message=NULL WHERE id=$1
	`, id, status, imported, notes)

	return &ImportResult{
		StatementID:      id,
		Source:           source,
		HoldingsImported: imported,
		Status:           status,
		Holdings:         saved,
		Notes:            notes,
	}, nil
}

func (s *MFService) upsertHolding(ctx context.Context, personID *uuid.UUID, source string, h mfparse.Holding) (*models.MFHolding, error) {
	var folioEnc *string
	if h.Folio != "" {
		e, err := s.box.EncryptString(h.Folio)
		if err != nil {
			return nil, err
		}
		folioEnc = &e
	}
	amc := nullIfEmpty(h.AMC)
	code := nullIfEmpty(h.ISIN)
	cat := nullIfEmpty(h.Category)
	folioDisp := nullIfEmpty(maskFolio(h.Folio))

	var id uuid.UUID
	err := s.pool.QueryRow(ctx, `
		INSERT INTO mf_holdings (
			person_id, folio_enc, folio_display, amc, scheme_name, scheme_code, isin,
			units, nav, invested_amount, current_value, category, source
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
		RETURNING id
	`, personID, folioEnc, folioDisp, amc, h.SchemeName, code, code,
		h.Units, nullDec(h.NAV), nullDec(h.InvestedAmount), nullDec(h.CurrentValue), cat, source,
	).Scan(&id)
	if err != nil {
		return nil, err
	}

	var m models.MFHolding
	err = s.pool.QueryRow(ctx, `
		SELECT id, person_id, amc, scheme_name, scheme_code, units, nav, nav_date,
		       invested_amount, current_value, category, source, created_at, updated_at
		FROM mf_holdings WHERE id=$1
	`, id).Scan(&m.ID, &m.PersonID, &m.AMC, &m.SchemeName, &m.SchemeCode, &m.Units, &m.NAV, &m.NAVDate,
		&m.InvestedAmount, &m.CurrentValue, &m.Category, &m.Source, &m.CreatedAt, &m.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

type CreateMFInput struct {
	PersonID       *uuid.UUID       `json:"person_id"`
	AMC            *string          `json:"amc"`
	SchemeName     string           `json:"scheme_name"`
	Units          decimal.Decimal  `json:"units"`
	NAV            *decimal.Decimal `json:"nav"`
	InvestedAmount *decimal.Decimal `json:"invested_amount"`
	CurrentValue   *decimal.Decimal `json:"current_value"`
	Category       *string          `json:"category"`
	Folio          *string          `json:"folio"`
}

func (s *MFService) CreateHolding(ctx context.Context, in CreateMFInput) (*models.MFHolding, error) {
	if in.SchemeName == "" {
		return nil, fmt.Errorf("scheme_name required")
	}
	h := mfparse.Holding{
		SchemeName: in.SchemeName,
		Units:      in.Units,
	}
	if in.AMC != nil {
		h.AMC = *in.AMC
	}
	if in.NAV != nil {
		h.NAV = *in.NAV
	}
	if in.InvestedAmount != nil {
		h.InvestedAmount = *in.InvestedAmount
	}
	if in.CurrentValue != nil {
		h.CurrentValue = *in.CurrentValue
	}
	if in.Category != nil {
		h.Category = *in.Category
	}
	if in.Folio != nil {
		h.Folio = *in.Folio
	}
	if h.CurrentValue.IsZero() && !h.Units.IsZero() && !h.NAV.IsZero() {
		h.CurrentValue = h.Units.Mul(h.NAV).Round(2)
	}
	return s.upsertHolding(ctx, in.PersonID, "manual", h)
}

func (s *MFService) ListStatements(ctx context.Context) ([]map[string]any, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, source, filename, status, holdings_imported, parse_notes, created_at, parsed_at
		FROM mf_statements ORDER BY created_at DESC LIMIT 50
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var id uuid.UUID
		var source, filename, status string
		var imported *int
		var notes *string
		var created time.Time
		var parsed *time.Time
		if err := rows.Scan(&id, &source, &filename, &status, &imported, &notes, &created, &parsed); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{
			"id": id, "source": source, "filename": filename, "status": status,
			"holdings_imported": imported, "parse_notes": notes, "created_at": created, "parsed_at": parsed,
		})
	}
	return out, rows.Err()
}

func extractPDFStrings(b []byte) string {
	// Lightweight scan for printable runs inside PDF (works for some text-based CAS files).
	var bld strings.Builder
	run := 0
	for _, c := range b {
		if c >= 32 && c < 127 {
			bld.WriteByte(c)
			run++
		} else {
			if run > 0 {
				bld.WriteByte('\n')
			}
			run = 0
		}
	}
	s := bld.String()
	if len(s) < 80 {
		return ""
	}
	return s
}

func nullIfEmpty(s string) *string {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return &s
}

func nullDec(d decimal.Decimal) *decimal.Decimal {
	if d.IsZero() {
		return nil
	}
	return &d
}

func maskFolio(f string) string {
	if len(f) <= 4 {
		return f
	}
	return strings.Repeat("•", len(f)-4) + f[len(f)-4:]
}
