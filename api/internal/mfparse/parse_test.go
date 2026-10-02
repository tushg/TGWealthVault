package mfparse_test

import (
	"testing"

	"github.com/tushg/TGWealthVault/api/internal/mfparse"
)

func TestParseCSV(t *testing.T) {
	raw := "scheme,folio,units,nav,value,amc,category\n" +
		"Parag Parikh Flexi Cap,12345678,100.5,80.25,8065.125,PPFAS,Equity\n"
	h := mfparse.ParseCSV(raw)
	if len(h) != 1 {
		t.Fatalf("expected 1 holding, got %d", len(h))
	}
	if h[0].SchemeName != "Parag Parikh Flexi Cap" {
		t.Fatalf("scheme=%q", h[0].SchemeName)
	}
}

func TestDetectSource(t *testing.T) {
	if mfparse.DetectSource("kfin-cas.pdf", "") != "kfin" {
		t.Fatal("expected kfin")
	}
	if mfparse.DetectSource("cams.pdf", "") != "cams" {
		t.Fatal("expected cams")
	}
}
