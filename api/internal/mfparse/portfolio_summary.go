package mfparse

import (
	"regexp"
	"strings"

	"github.com/shopspring/decimal"
)

// ParsePortfolioSummary parses CAMS "PORTFOLIO SUMMARY" AMC rows:
// "ICICI Prudential Mutual Fund  4,83,000.00  4,96,262.24"
func ParsePortfolioSummary(raw string) []Holding {
	raw = strings.ReplaceAll(raw, "\r\n", "\n")
	raw = strings.ReplaceAll(raw, "\t", " ")
	var out []Holding

	// Two Indian-format amounts at end of line
	reRow := regexp.MustCompile(`(?i)^(.+?Mutual\s+Fund)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$`)
	// Fallback: any name + two decimals (loose)
	reLoose := regexp.MustCompile(`(?i)^(.+?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$`)

	for _, line := range strings.Split(raw, "\n") {
		trim := strings.TrimSpace(line)
		if trim == "" {
			continue
		}
		low := strings.ToLower(trim)
		if strings.Contains(low, "portfolio summary") ||
			strings.Contains(low, "cost value") ||
			strings.Contains(low, "market value") ||
			strings.HasPrefix(low, "total") ||
			strings.HasPrefix(low, "date") && strings.Contains(low, "transaction") {
			continue
		}

		var name, costS, mktS string
		if m := reRow.FindStringSubmatch(trim); len(m) == 4 {
			name, costS, mktS = strings.TrimSpace(m[1]), m[2], m[3]
		} else if m := reLoose.FindStringSubmatch(trim); len(m) == 4 {
			name = strings.TrimSpace(m[1])
			costS, mktS = m[2], m[3]
			if !strings.Contains(strings.ToLower(name), "fund") &&
				!strings.Contains(strings.ToLower(name), "mutual") {
				continue
			}
		} else {
			continue
		}
		if strings.EqualFold(name, "Total") || strings.HasPrefix(strings.ToLower(name), "total") {
			continue
		}

		cost := indianDec(costS)
		mkt := indianDec(mktS)
		if cost.IsZero() && mkt.IsZero() {
			continue
		}
		out = append(out, Holding{
			AMC:            name,
			SchemeName:     name,
			InvestedAmount: cost,
			CurrentValue:   mkt,
			Units:          decimal.NewFromInt(1), // placeholder unit for AMC summary rows
			NAV:            mkt,
			Category:       "Equity",
		})
	}
	return out
}

// indianDec parses 4,83,000.00 and 483000.00 styles.
func indianDec(s string) decimal.Decimal {
	s = strings.TrimSpace(s)
	s = strings.ReplaceAll(s, ",", "")
	s = strings.ReplaceAll(s, "₹", "")
	if s == "" {
		return decimal.Zero
	}
	d, err := decimal.NewFromString(s)
	if err != nil {
		return decimal.Zero
	}
	return d
}

// LooksLikePortfolioSummary detects CAMS portfolio summary pages.
func LooksLikePortfolioSummary(raw string) bool {
	u := strings.ToUpper(raw)
	return strings.Contains(u, "PORTFOLIO SUMMARY") ||
		(strings.Contains(u, "COST VALUE") && strings.Contains(u, "MARKET VALUE") && strings.Contains(u, "MUTUAL FUND"))
}
