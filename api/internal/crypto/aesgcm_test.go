package crypto_test

import (
	"testing"

	"github.com/tushg/TGWealthVault/api/internal/crypto"
)

func TestAESGCMRoundTrip(t *testing.T) {
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i)
	}
	box, err := crypto.NewBox(key)
	if err != nil {
		t.Fatal(err)
	}
	enc, err := box.EncryptString("folio-secret-123")
	if err != nil {
		t.Fatal(err)
	}
	plain, err := box.DecryptString(enc)
	if err != nil {
		t.Fatal(err)
	}
	if plain != "folio-secret-123" {
		t.Fatalf("got %q", plain)
	}
}
