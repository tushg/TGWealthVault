package services

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/ledongthuc/pdf"
	"github.com/shopspring/decimal"

	"github.com/tushg/TGWealthVault/api/internal/crypto"
	"github.com/tushg/TGWealthVault/api/internal/mfparse"
	"github.com/tushg/TGWealthVault/api/internal/models"
)

type MFService struct {
	pool      *pgxpool.Pool
	box       *crypto.Box
	uploadDir string
}

func NewMFService(pool *pgxpool.Pool, box *crypto.Box, uploadDir string) *MFService {
	_ = os.MkdirAll(uploadDir, 0o700)
	return &MFService{pool: pool, box: box, uploadDir: uploadDir}
}

type ImportResult struct {
	StatementID           uuid.UUID          `json:"statement_id"`
	Source                string             `json:"source"`
	HoldingsImported      int                `json:"holdings_imported"`
	TransactionsImported  int                `json:"transactions_imported"`
	Status                string             `json:"status"`
	Holdings              []models.MFHolding `json:"holdings,omitempty"`
	Notes                 string             `json:"notes,omitempty"`
}

func (s *MFService) ImportStatement(ctx context.Context, personID *uuid.UUID, source, filename, password string, fileBytes []byte, textFallback string, replaceExisting bool) (*ImportResult, error) {
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
	storagePath := filepath.Join(s.uploadDir, id.String()+".enc")
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

	lowerName := strings.ToLower(filename)
	if strings.HasSuffix(lowerName, ".png") || strings.HasSuffix(lowerName, ".jpg") || strings.HasSuffix(lowerName, ".jpeg") || strings.HasSuffix(lowerName, ".webp") {
		if strings.TrimSpace(textFallback) == "" {
			notes := "Image uploads are not OCR'd yet. Paste the PORTFOLIO SUMMARY text (Mutual Fund / Cost / Market Value rows) in the text box."
			_, _ = s.pool.Exec(ctx, `
				UPDATE mf_statements SET status='failed', error_message=$2, parse_notes=$3, parsed_at=NOW() WHERE id=$1
			`, id, "image requires pasted summary text", notes)
			return &ImportResult{StatementID: id, Source: source, Status: "failed", Notes: notes}, nil
		}
	}

	text, notes := s.extractStatementText(filename, fileBytes, textFallback, password)
	if strings.TrimSpace(text) == "" {
		_, _ = s.pool.Exec(ctx, `
			UPDATE mf_statements SET status='failed', error_message=$2, parse_notes=$3, parsed_at=NOW() WHERE id=$1
		`, id, "no text extracted from statement", notes)
		return &ImportResult{StatementID: id, Source: source, Status: "failed", Notes: notes}, nil
	}

	var holdings []mfparse.Holding
	var txns []mfparse.Transaction

	// Prefer CAMS Portfolio Summary (AMC cost/market) — matches statement screenshots
	if summary := mfparse.ParsePortfolioSummary(text); len(summary) > 0 {
		holdings = summary
		notes += " Parsed PORTFOLIO SUMMARY (AMC cost & market value). "
	} else {
		detailed := mfparse.ParseDetailedCAS(text, source)
		holdings = detailed.Holdings
		txns = detailed.Transactions
		if len(holdings) == 0 {
			holdings = mfparse.ParseCSV(text)
		}
		if len(holdings) == 0 {
			holdings = mfparse.ParseCASText(text, source)
		}
	}

	if len(holdings) == 0 && len(txns) == 0 {
		notes += " No holdings/transactions detected. Paste PORTFOLIO SUMMARY rows or Detailed CAS text."
		_, _ = s.pool.Exec(ctx, `
			UPDATE mf_statements SET status='failed', error_message=$2, parse_notes=$3, parsed_at=NOW() WHERE id=$1
		`, id, "no holdings detected", notes)
		return &ImportResult{StatementID: id, Source: source, Status: "failed", Notes: notes}, nil
	}

	if replaceExisting {
		// Drop goal links for CAMS/KFin holdings, then holdings (transactions cascade)
		_, _ = s.pool.Exec(ctx, `
			DELETE FROM goal_assets ga
			USING mf_holdings h
			WHERE ga.asset_type='mf' AND ga.asset_id = h.id AND h.source IN ('cams','kfin')
		`)
		_, _ = s.pool.Exec(ctx, `DELETE FROM mf_holdings WHERE source IN ('cams','kfin')`)
		notes += " Replaced previous CAMS/KFin holdings. "
	}

	importedHoldings := 0
	importedTxns := 0
	var saved []models.MFHolding
	holdingIDs := map[string]uuid.UUID{}

	for _, h := range holdings {
		mh, err := s.upsertHolding(ctx, personID, source, h)
		if err != nil {
			continue
		}
		importedHoldings++
		saved = append(saved, *mh)
		key := holdingKey(h.SchemeName, h.Folio, h.ISIN)
		holdingIDs[key] = mh.ID
	}

	for _, t := range txns {
		key := holdingKey(t.SchemeName, t.Folio, t.ISIN)
		hid, ok := holdingIDs[key]
		if !ok {
			// Ensure holding exists for this scheme
			h := mfparse.Holding{
				AMC: t.AMC, SchemeName: t.SchemeName, Folio: t.Folio, ISIN: t.ISIN,
				Units: t.Balance, NAV: t.NAV, Category: "Equity",
			}
			if h.Units.IsZero() {
				h.Units = t.Units
			}
			mh, err := s.upsertHolding(ctx, personID, source, h)
			if err != nil {
				continue
			}
			hid = mh.ID
			holdingIDs[key] = hid
			saved = append(saved, *mh)
			importedHoldings++
		}
		if err := s.insertTransaction(ctx, hid, &id, t); err != nil {
			continue
		}
		importedTxns++
	}

	notes = strings.TrimSpace(notes + fmt.Sprintf(" Parsed %d transaction(s), %d scheme holding(s).", importedTxns, importedHoldings))
	_, _ = s.pool.Exec(ctx, `
		UPDATE mf_statements
		SET status='parsed', holdings_imported=$2, transactions_imported=$3, parse_notes=$4, parsed_at=NOW(), error_message=NULL
		WHERE id=$1
	`, id, importedHoldings, importedTxns, notes)

	return &ImportResult{
		StatementID:          id,
		Source:               source,
		HoldingsImported:     importedHoldings,
		TransactionsImported: importedTxns,
		Status:               "parsed",
		Holdings:             saved,
		Notes:                notes,
	}, nil
}

func (s *MFService) extractStatementText(filename string, fileBytes []byte, textFallback, password string) (string, string) {
	notes := ""
	lower := strings.ToLower(filename)

	if textFallback != "" {
		notes = "Used pasted statement text. "
		return textFallback, notes
	}
	if strings.HasSuffix(lower, ".csv") || strings.HasSuffix(lower, ".txt") {
		return string(fileBytes), "Read as plain text/CSV. "
	}

	if password != "" {
		notes += "PDF password stored encrypted. "
	}

	if txt, err := extractPDFWithReader(fileBytes); err == nil && len(strings.TrimSpace(txt)) > 80 {
		notes += "Extracted PDF text via PDF reader. "
		return txt, notes
	}

	raw := extractPDFStrings(fileBytes)
	if len(strings.TrimSpace(raw)) > 80 {
		notes += "Extracted embedded PDF strings. "
		return raw, notes
	}

	notes += "Could not extract PDF text (often password-protected or scanned). Paste CAS text or upload CSV. "
	return "", notes
}

func extractPDFWithReader(b []byte) (string, error) {
	r, err := pdf.NewReader(bytes.NewReader(b), int64(len(b)))
	if err != nil {
		return "", err
	}
	var buf strings.Builder
	total := r.NumPage()
	for i := 1; i <= total; i++ {
		p := r.Page(i)
		if p.V.IsNull() {
			continue
		}
		text, err := p.GetPlainText(nil)
		if err != nil {
			continue
		}
		buf.WriteString(text)
		buf.WriteByte('\n')
	}
	return buf.String(), nil
}

func holdingKey(scheme, folio, isin string) string {
	return strings.ToLower(strings.TrimSpace(scheme)) + "|" + strings.ToLower(strings.TrimSpace(folio)) + "|" + strings.ToUpper(strings.TrimSpace(isin))
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

	var existing uuid.UUID
	err := s.pool.QueryRow(ctx, `
		SELECT id FROM mf_holdings
		WHERE lower(scheme_name)=lower($1)
		  AND coalesce(lower(folio_display),'') = coalesce(lower($2),'')
		LIMIT 1
	`, h.SchemeName, maskFolio(h.Folio)).Scan(&existing)

	var id uuid.UUID
	if err == nil {
		id = existing
		_, err = s.pool.Exec(ctx, `
			UPDATE mf_holdings SET
				person_id=COALESCE($2, person_id),
				folio_enc=COALESCE($3, folio_enc),
				folio_display=COALESCE($4, folio_display),
				amc=COALESCE($5, amc),
				scheme_code=COALESCE($6, scheme_code),
				isin=COALESCE($7, isin),
				units=$8,
				nav=COALESCE($9, nav),
				invested_amount=COALESCE($10, invested_amount),
				current_value=COALESCE($11, current_value),
				category=COALESCE($12, category),
				source=$13,
				updated_at=NOW()
			WHERE id=$1
		`, id, personID, folioEnc, folioDisp, amc, code, code,
			h.Units, nullDec(h.NAV), nullDec(h.InvestedAmount), nullDec(h.CurrentValue), cat, source)
		if err != nil {
			return nil, err
		}
	} else if err == pgx.ErrNoRows {
		err = s.pool.QueryRow(ctx, `
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
	} else {
		return nil, err
	}

	return s.getHolding(ctx, id)
}

func (s *MFService) getHolding(ctx context.Context, id uuid.UUID) (*models.MFHolding, error) {
	var m models.MFHolding
	err := s.pool.QueryRow(ctx, `
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

func (s *MFService) insertTransaction(ctx context.Context, holdingID uuid.UUID, statementID *uuid.UUID, t mfparse.Transaction) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO mf_transactions (holding_id, statement_id, txn_date, description, txn_type, amount, units, nav, balance_units)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
	`, holdingID, statementID, t.Date, t.Description, t.Type,
		nullDec(t.Amount), nullDec(t.Units), nullDec(t.NAV), nullDec(t.Balance))
	return err
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
	h := mfparse.Holding{SchemeName: in.SchemeName, Units: in.Units}
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

func (s *MFService) DeleteHolding(ctx context.Context, id uuid.UUID) error {
	_, _ = s.pool.Exec(ctx, `DELETE FROM goal_assets WHERE asset_type='mf' AND asset_id=$1`, id)
	tag, err := s.pool.Exec(ctx, `DELETE FROM mf_holdings WHERE id=$1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("holding not found")
	}
	return nil
}

func (s *MFService) ListTransactions(ctx context.Context, holdingID *uuid.UUID) ([]models.MFTransaction, error) {
	q := `
		SELECT t.id, t.holding_id, h.scheme_name, t.txn_date, t.description, t.txn_type,
		       t.amount, t.units, t.nav, t.balance_units, t.created_at
		FROM mf_transactions t
		JOIN mf_holdings h ON h.id = t.holding_id`
	args := []any{}
	if holdingID != nil {
		q += ` WHERE t.holding_id=$1`
		args = append(args, *holdingID)
	}
	q += ` ORDER BY t.txn_date DESC, t.created_at DESC LIMIT 500`

	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.MFTransaction
	for rows.Next() {
		var t models.MFTransaction
		if err := rows.Scan(&t.ID, &t.HoldingID, &t.SchemeName, &t.TxnDate, &t.Description, &t.TxnType,
			&t.Amount, &t.Units, &t.NAV, &t.BalanceUnits, &t.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	if out == nil {
		out = []models.MFTransaction{}
	}
	return out, rows.Err()
}

func (s *MFService) ListStatements(ctx context.Context) ([]map[string]any, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, source, filename, status, holdings_imported, transactions_imported, parse_notes, created_at, parsed_at
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
		var imported, txImported *int
		var notes *string
		var created time.Time
		var parsed *time.Time
		if err := rows.Scan(&id, &source, &filename, &status, &imported, &txImported, &notes, &created, &parsed); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{
			"id": id, "source": source, "filename": filename, "status": status,
			"holdings_imported": imported, "transactions_imported": txImported,
			"parse_notes": notes, "created_at": created, "parsed_at": parsed,
		})
	}
	return out, rows.Err()
}

func (s *MFService) DeleteStatement(ctx context.Context, id uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM mf_statements WHERE id=$1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("statement not found")
	}
	return nil
}

func extractPDFStrings(b []byte) string {
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
	f = strings.TrimSpace(f)
	if len(f) <= 4 {
		return f
	}
	return strings.Repeat("•", len(f)-4) + f[len(f)-4:]
}
