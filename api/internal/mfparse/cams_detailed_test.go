package mfparse_test

import (
	"testing"

	"github.com/tushg/TGWealthVault/api/internal/mfparse"
)

func TestParseDetailedCAS(t *testing.T) {
	raw := `
HDFC Mutual Fund
Folio No: 12345678 / 90
INF179K01YV8 HDFC Mid-Cap Opportunities Fund - Direct Plan - Growth Option
01-Apr-2023 SIP Purchase 5000.00 45.234 110.534 45.234
15-May-2023 SIP Purchase 5000.00 44.100 113.379 89.334
30-Jun-2023 Redemption 2000.00 17.500 114.286 71.834
`
	cas := mfparse.ParseDetailedCAS(raw, "cams")
	if len(cas.Transactions) < 2 {
		t.Fatalf("expected transactions, got %d", len(cas.Transactions))
	}
	if len(cas.Holdings) != 1 {
		t.Fatalf("expected 1 holding, got %d", len(cas.Holdings))
	}
	h := cas.Holdings[0]
	if h.SchemeName == "" {
		t.Fatal("missing scheme name")
	}
	if h.Units.IsZero() {
		t.Fatal("expected units from balance")
	}
}
