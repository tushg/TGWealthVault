package mfparse

import (
	"regexp"
	"strconv"
	"strings"

	"github.com/shopspring/decimal"
)

// Holding is a normalized mutual-fund line item from CAS / CSV.
type Holding struct {
	AMC            string
	SchemeName     string
	Folio          string
	ISIN           string
	Units          decimal.Decimal
	NAV            decimal.Decimal
	InvestedAmount decimal.Decimal
	CurrentValue   decimal.Decimal
	Category       string
}

var (
	reISIN   = regexp.MustCompile(`\bINF[A-Z0-9]{9}\b`)
	reAmount = regexp.MustCompile(`[\d,]+\.\d{2,4}`)
	reUnits  = regexp.MustCompile(`[\d,]+\.\d{3,4}`)
)

// ParseCSV expects header row with flexible column names:
// scheme,folio,units,nav,invested,value,amc,category,isin
func ParseCSV(raw string) []Holding {
	lines := splitLines(raw)
	if len(lines) < 2 {
		return nil
	}
	header := splitCSV(lines[0])
	idx := map[string]int{}
	for i, h := range header {
		idx[normalizeHeader(h)] = i
	}
	var out []Holding
	for _, line := range lines[1:] {
		cols := splitCSV(line)
		if len(cols) == 0 {
			continue
		}
		get := func(keys ...string) string {
			for _, k := range keys {
				if j, ok := idx[k]; ok && j < len(cols) {
					return strings.TrimSpace(cols[j])
				}
			}
			return ""
		}
		scheme := get("scheme", "schemename", "fund")
		if scheme == "" {
			continue
		}
		h := Holding{
			SchemeName:     scheme,
			AMC:            get("amc", "fundhouse"),
			Folio:          get("folio", "foliono", "folio_number"),
			ISIN:           get("isin"),
			Units:          dec(get("units", "balanceunits", "closingbalance")),
			NAV:            dec(get("nav", "latestnav")),
			InvestedAmount: dec(get("invested", "cost", "investedamount", "amountinvested")),
			CurrentValue:   dec(get("value", "currentvalue", "marketvalue")),
			Category:       get("category", "assetclass"),
		}
		if h.CurrentValue.IsZero() && !h.Units.IsZero() && !h.NAV.IsZero() {
			h.CurrentValue = h.Units.Mul(h.NAV).Round(2)
		}
		out = append(out, h)
	}
	return out
}

// ParseCASText extracts holdings from CAMS/KFin-like plaintext (unlocked PDF dump).
// Heuristic: lines containing an ISIN or "Folio" near scheme names with amounts.
func ParseCASText(raw string, source string) []Holding {
	raw = strings.ReplaceAll(raw, "\r\n", "\n")
	lines := strings.Split(raw, "\n")
	var out []Holding
	var currentAMC string

	amcHints := []string{"Mutual Fund", "MF", "Asset Management", "AMC"}
	for i, line := range lines {
		trim := strings.TrimSpace(line)
		if trim == "" {
			continue
		}
		upper := strings.ToUpper(trim)
		for _, h := range amcHints {
			if strings.Contains(trim, h) && len(trim) < 80 {
				currentAMC = strings.TrimSpace(strings.Split(trim, "  ")[0])
			}
		}
		isin := reISIN.FindString(upper)
		folio := ""
		if m := regexp.MustCompile(`(?i)folio\s*(?:no\.?|:)?\s*([A-Z0-9/\-]+)`).FindStringSubmatch(trim); len(m) == 2 {
			folio = m[1]
		}

		// Prefer lines that look like scheme rows: have units + nav-like decimals
		amounts := reAmount.FindAllString(trim, -1)
		if len(amounts) < 2 && isin == "" {
			continue
		}

		scheme := trim
		if isin != "" {
			scheme = strings.TrimSpace(strings.Replace(scheme, isin, "", 1))
		}
		// Drop trailing numbers for scheme name
		scheme = regexp.MustCompile(`[\d,]+\.\d+.*$`).ReplaceAllString(scheme, "")
		scheme = strings.TrimSpace(scheme)
		scheme = regexp.MustCompile(`(?i)folio\s*(?:no\.?|:)?\s*[A-Z0-9/\-]+`).ReplaceAllString(scheme, "")
		scheme = strings.TrimSpace(scheme)
		if len(scheme) < 6 || len(scheme) > 120 {
			// Try previous line as scheme name
			if i > 0 {
				prev := strings.TrimSpace(lines[i-1])
				if len(prev) >= 6 && len(prev) < 120 && !reISIN.MatchString(prev) {
					scheme = prev
				} else {
					continue
				}
			} else {
				continue
			}
		}

		units := decimal.Zero
		nav := decimal.Zero
		value := decimal.Zero
		if len(amounts) >= 1 {
			units = dec(amounts[0])
		}
		if len(amounts) >= 2 {
			nav = dec(amounts[1])
		}
		if len(amounts) >= 3 {
			value = dec(amounts[len(amounts)-1])
		}
		if value.IsZero() && !units.IsZero() && !nav.IsZero() {
			value = units.Mul(nav).Round(2)
		}
		if units.IsZero() && value.IsZero() {
			continue
		}

		cat := "Equity"
		if source == "kfin" {
			cat = "Equity"
		}
		low := strings.ToLower(scheme)
		if strings.Contains(low, "debt") || strings.Contains(low, "liquid") || strings.Contains(low, "gilt") {
			cat = "Debt"
		} else if strings.Contains(low, "hybrid") || strings.Contains(low, "balanced") {
			cat = "Hybrid"
		}

		out = append(out, Holding{
			AMC:          currentAMC,
			SchemeName:   scheme,
			Folio:        folio,
			ISIN:         isin,
			Units:        units,
			NAV:          nav,
			CurrentValue: value,
			Category:     cat,
		})
	}
	return dedupe(out)
}

func DetectSource(filename, text string) string {
	u := strings.ToUpper(filename + " " + text)
	if strings.Contains(u, "KFIN") || strings.Contains(u, "KARVY") {
		return "kfin"
	}
	return "cams"
}

func splitLines(s string) []string {
	s = strings.ReplaceAll(s, "\r\n", "\n")
	var out []string
	for _, l := range strings.Split(s, "\n") {
		if strings.TrimSpace(l) != "" {
			out = append(out, l)
		}
	}
	return out
}

func splitCSV(line string) []string {
	var cols []string
	var cur strings.Builder
	inQ := false
	for _, r := range line {
		switch {
		case r == '"':
			inQ = !inQ
		case (r == ',' || r == '\t' || r == ';') && !inQ:
			cols = append(cols, cur.String())
			cur.Reset()
		default:
			cur.WriteRune(r)
		}
	}
	cols = append(cols, cur.String())
	return cols
}

func normalizeHeader(h string) string {
	h = strings.ToLower(strings.TrimSpace(h))
	h = strings.ReplaceAll(h, " ", "")
	h = strings.ReplaceAll(h, "_", "")
	h = strings.ReplaceAll(h, "-", "")
	return h
}

func dec(s string) decimal.Decimal {
	s = strings.TrimSpace(s)
	s = strings.ReplaceAll(s, ",", "")
	s = strings.ReplaceAll(s, "₹", "")
	s = strings.ReplaceAll(s, "Rs.", "")
	if s == "" {
		return decimal.Zero
	}
	d, err := decimal.NewFromString(s)
	if err != nil {
		f, e2 := strconv.ParseFloat(s, 64)
		if e2 != nil {
			return decimal.Zero
		}
		return decimal.NewFromFloat(f)
	}
	return d
}

func dedupe(in []Holding) []Holding {
	seen := map[string]bool{}
	var out []Holding
	for _, h := range in {
		key := strings.ToLower(h.SchemeName + "|" + h.Folio + "|" + h.ISIN)
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, h)
	}
	return out
}
