package mfparse

import (
	"errors"
	"regexp"
	"strings"
	"time"

	"github.com/shopspring/decimal"
)

// Transaction is one CAS ledger row.
type Transaction struct {
	Date        time.Time
	Description string
	Type        string // purchase | redemption | switch_in | switch_out | dividend | other
	Amount      decimal.Decimal
	Units       decimal.Decimal
	NAV         decimal.Decimal
	Balance     decimal.Decimal
	AMC         string
	SchemeName  string
	Folio       string
	ISIN        string
}

// DetailedCAS is a parsed detailed CAMS/KFin statement.
type DetailedCAS struct {
	Transactions []Transaction
	Holdings     []Holding
}

var (
	reFolioLine = regexp.MustCompile(`(?i)folio\s*(?:no\.?|number)?\s*[:\-]?\s*([0-9][0-9A-Z/\s\-]{3,})`)
	reISINLine  = regexp.MustCompile(`\b(INF[A-Z0-9]{9})\b`)
	reDateHead  = regexp.MustCompile(`(?i)^(\d{1,2}[-/](?:[A-Za-z]{3}|\d{1,2})[-/]\d{2,4})\b`)
	reNums      = regexp.MustCompile(`-?[\d,]+\.\d{2,6}`)
	reSchemeish = regexp.MustCompile(`(?i)(fund|growth|direct|regular|idcw|dividend|index|liquid|debt|equity|hybrid|elss|fof)`)
	reAMCLine   = regexp.MustCompile(`(?i)^(.{3,80}?)\s+(Mutual\s+Fund|MF)\s*$`)
)

// ParseDetailedCAS parses CAMS/KFin detailed transaction statement text into
// transactions and aggregated holdings (by scheme + folio).
func ParseDetailedCAS(raw, source string) DetailedCAS {
	raw = strings.ReplaceAll(raw, "\r\n", "\n")
	raw = strings.ReplaceAll(raw, "\t", " ")
	lines := strings.Split(raw, "\n")

	var (
		amc, folio, scheme, isin string
		txns                     []Transaction
	)

	flushScheme := func() {}
	_ = flushScheme

	for _, line := range lines {
		trim := strings.TrimSpace(line)
		if trim == "" {
			continue
		}
		// Skip noisy headers/footers
		low := strings.ToLower(trim)
		if strings.Contains(low, "page ") || strings.Contains(low, "www.camsonline") ||
			strings.Contains(low, "kfintech") && strings.Contains(low, "http") ||
			strings.HasPrefix(low, "consolidated account statement") ||
			strings.Contains(low, "this is a computer generated") {
			continue
		}

		if m := reAMCLine.FindStringSubmatch(trim); len(m) == 3 {
			amc = strings.TrimSpace(m[1] + " " + m[2])
			continue
		}
		if m := reFolioLine.FindStringSubmatch(trim); len(m) == 2 {
			folio = strings.Join(strings.Fields(m[1]), " ")
			continue
		}
		if m := reISINLine.FindStringSubmatch(strings.ToUpper(trim)); len(m) == 2 {
			isin = m[1]
			// Scheme often on same or previous context — if line has more text, use as scheme
			name := strings.TrimSpace(reISINLine.ReplaceAllString(trim, ""))
			name = regexp.MustCompile(`(?i)\bISIN\b\s*[:\-]?`).ReplaceAllString(name, "")
			name = strings.TrimSpace(name)
			if len(name) >= 8 && reSchemeish.MatchString(name) {
				scheme = cleanScheme(name)
			}
			continue
		}

		// Scheme header lines (no leading date, looks like a fund name)
		if !reDateHead.MatchString(trim) && reSchemeish.MatchString(trim) && len(trim) >= 10 && len(trim) < 140 {
			if !strings.Contains(low, "opening") && !strings.Contains(low, "closing") &&
				!strings.Contains(low, "valuation") && !strings.Contains(low, "registrar") &&
				!strings.Contains(low, "transaction") && countNums(trim) < 3 {
				scheme = cleanScheme(trim)
				continue
			}
		}

		// Closing / valuation hints → update last holding context via synthetic valuation txn skipped
		if strings.Contains(low, "closing unit") || strings.Contains(low, "closing balance") {
			continue
		}

		txn, ok := parseTxnLine(trim)
		if !ok || scheme == "" {
			continue
		}
		txn.AMC = amc
		txn.SchemeName = scheme
		txn.Folio = folio
		txn.ISIN = isin
		txns = append(txns, txn)
	}

	return DetailedCAS{
		Transactions: txns,
		Holdings:     holdingsFromTransactions(txns, source),
	}
}

func parseTxnLine(line string) (Transaction, bool) {
	m := reDateHead.FindStringSubmatch(line)
	if len(m) == 0 {
		return Transaction{}, false
	}
	date, err := parseCASDate(m[1])
	if err != nil {
		return Transaction{}, false
	}
	rest := strings.TrimSpace(line[len(m[0]):])
	nums := reNums.FindAllString(rest, -1)
	if len(nums) < 2 {
		return Transaction{}, false
	}

	// Description is text before the first number cluster
	desc := rest
	if loc := reNums.FindStringIndex(rest); loc != nil {
		desc = strings.TrimSpace(rest[:loc[0]])
	}
	desc = strings.TrimSpace(desc)
	if desc == "" {
		return Transaction{}, false
	}

	// Typical order: amount, units, nav, balance  OR amount, nav, units, balance
	amount := dec(nums[0])
	units := decimal.Zero
	nav := decimal.Zero
	balance := decimal.Zero
	switch len(nums) {
	case 2:
		units = dec(nums[1])
	case 3:
		units = dec(nums[1])
		nav = dec(nums[2])
	default:
		// Heuristic: NAV usually 10–10000, units can be large; balance is last
		balance = dec(nums[len(nums)-1])
		a1 := dec(nums[1])
		a2 := dec(nums[2])
		// Prefer middle-small as NAV when between 1 and 20000 and units different
		if a2.GreaterThan(decimal.NewFromInt(1)) && a2.LessThan(decimal.NewFromInt(20000)) && !a1.Equal(a2) {
			units = a1
			nav = a2
		} else {
			nav = a1
			units = a2
		}
		if len(nums) >= 4 {
			// already set balance
		}
	}

	typ := classifyTxn(desc)
	// Redemptions / switch-outs often negative units in CAS; if description says redeem and units positive, keep sign via type
	if (typ == "redemption" || typ == "switch_out") && units.IsPositive() {
		// leave positive; invested calc will subtract by type
	}

	return Transaction{
		Date:        date,
		Description: desc,
		Type:        typ,
		Amount:      amount,
		Units:       units,
		NAV:         nav,
		Balance:     balance,
	}, true
}

func holdingsFromTransactions(txns []Transaction, source string) []Holding {
	type key struct{ scheme, folio, isin string }
	type agg struct {
		amc, scheme, folio, isin string
		units, invested, value   decimal.Decimal
		nav                      decimal.Decimal
		lastBal                  decimal.Decimal
		hasBal                   bool
	}
	m := map[key]*agg{}
	order := []key{}

	for _, t := range txns {
		k := key{strings.ToLower(t.SchemeName), strings.ToLower(t.Folio), strings.ToUpper(t.ISIN)}
		a, ok := m[k]
		if !ok {
			a = &agg{amc: t.AMC, scheme: t.SchemeName, folio: t.Folio, isin: t.ISIN}
			m[k] = a
			order = append(order, k)
		}
		switch t.Type {
		case "purchase", "switch_in", "dividend":
			a.invested = a.invested.Add(t.Amount)
			a.units = a.units.Add(t.Units)
		case "redemption", "switch_out":
			a.invested = a.invested.Sub(t.Amount)
			a.units = a.units.Sub(t.Units.Abs())
		default:
			if t.Units.IsPositive() {
				a.units = a.units.Add(t.Units)
				a.invested = a.invested.Add(t.Amount)
			} else if t.Units.IsNegative() {
				a.units = a.units.Add(t.Units)
			}
		}
		if !t.NAV.IsZero() {
			a.nav = t.NAV
		}
		if !t.Balance.IsZero() {
			a.lastBal = t.Balance
			a.hasBal = true
		}
	}

	var out []Holding
	for _, k := range order {
		a := m[k]
		units := a.units
		if a.hasBal {
			units = a.lastBal
		}
		if units.IsNegative() {
			units = decimal.Zero
		}
		val := decimal.Zero
		if !a.nav.IsZero() && !units.IsZero() {
			val = units.Mul(a.nav).Round(2)
		}
		invested := a.invested
		if invested.IsNegative() {
			invested = decimal.Zero
		}
		cat := "Equity"
		low := strings.ToLower(a.scheme)
		if strings.Contains(low, "debt") || strings.Contains(low, "liquid") || strings.Contains(low, "gilt") || strings.Contains(low, "overnight") {
			cat = "Debt"
		} else if strings.Contains(low, "hybrid") || strings.Contains(low, "balanced") || strings.Contains(low, "arbitrage") {
			cat = "Hybrid"
		}
		if units.IsZero() && invested.IsZero() {
			continue
		}
		out = append(out, Holding{
			AMC:            a.amc,
			SchemeName:     a.scheme,
			Folio:          a.folio,
			ISIN:           a.isin,
			Units:          units,
			NAV:            a.nav,
			InvestedAmount: invested.Round(2),
			CurrentValue:   val,
			Category:       cat,
		})
	}
	_ = source
	return out
}

func classifyTxn(desc string) string {
	d := strings.ToLower(desc)
	switch {
	case strings.Contains(d, "switch in"), strings.Contains(d, "switch-in"):
		return "switch_in"
	case strings.Contains(d, "switch out"), strings.Contains(d, "switch-out"):
		return "switch_out"
	case strings.Contains(d, "redemption"), strings.Contains(d, "redeem"):
		return "redemption"
	case strings.Contains(d, "dividend"), strings.Contains(d, "idcw"):
		return "dividend"
	case strings.Contains(d, "purchase"), strings.Contains(d, "sip"), strings.Contains(d, "invest"),
		strings.Contains(d, "systematic"):
		return "purchase"
	default:
		return "other"
	}
}

func cleanScheme(s string) string {
	s = regexp.MustCompile(`\s+`).ReplaceAllString(s, " ")
	s = regexp.MustCompile(`(?i)\(formerly.*?\)`).ReplaceAllString(s, "")
	s = strings.TrimSpace(s)
	return s
}

func countNums(s string) int {
	return len(reNums.FindAllString(s, -1))
}

func parseCASDate(s string) (time.Time, error) {
	s = strings.TrimSpace(s)
	layouts := []string{
		"02-Jan-2006", "2-Jan-2006", "02-Jan-06", "2-Jan-06",
		"02/01/2006", "2/1/2006", "02/01/06", "2/1/06",
		"02-01-2006", "02-01-06",
	}
	for _, l := range layouts {
		if t, err := time.Parse(l, s); err == nil {
			return t, nil
		}
	}
	return time.Time{}, errBadDate
}

var errBadDate = errors.New("bad cas date")