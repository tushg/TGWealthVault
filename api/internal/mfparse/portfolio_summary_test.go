package mfparse_test

import (
	"testing"

	"github.com/shopspring/decimal"
	"github.com/tushg/TGWealthVault/api/internal/mfparse"
)

func TestParsePortfolioSummary(t *testing.T) {
	raw := `
PORTFOLIO SUMMARY
Mutual Fund Cost Value(INR) Market Value(INR)
ICICI Prudential Mutual Fund 4,83,000.00 4,96,262.24
HDFC Mutual Fund 3,25,599.31 8,64,311.17
SBI Mutual Fund 7,66,500.00 9,05,825.51
PPFAS Mutual Fund 4,68,447.10 9,25,218.62
Kotak Mutual Fund 2,56,000.00 4,37,366.72
Franklin Templeton Mutual Fund 81,000.00 99,175.93
Helios Mutual Fund 2,71,048.34 2,80,605.16
Bandhan Mutual Fund 1,46,000.00 1,49,394.06
AXIS Mutual Fund 7,500.00 7,502.39
Invesco Mutual Fund 5,000.00 4,999.74
Mirae Asset Mutual Fund 2,47,500.00 5,05,489.05
Total 30,57,594.75 46,76,150.58
`
	h := mfparse.ParsePortfolioSummary(raw)
	if len(h) != 11 {
		t.Fatalf("expected 11 funds, got %d", len(h))
	}
	if h[0].SchemeName != "ICICI Prudential Mutual Fund" {
		t.Fatalf("got %q", h[0].SchemeName)
	}
	want := decimal.RequireFromString("496262.24")
	if !h[0].CurrentValue.Equal(want) {
		t.Fatalf("market=%s want=%s", h[0].CurrentValue, want)
	}
}
