package config

import (
	"os"
	"path/filepath"

	"github.com/joho/godotenv"
)

func loadDotEnv() error {
	candidates := []string{
		".env",
		filepath.Join("..", ".env"),
		filepath.Join("..", "..", ".env"),
	}
	for _, p := range candidates {
		if _, err := os.Stat(p); err == nil {
			_ = godotenv.Load(p)
			return nil
		}
	}
	return nil
}
