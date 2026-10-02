package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Addr           string
	DatabaseURL    string
	AppEnv         string
	SessionSecret  string
	EncryptionKey  []byte // 32 bytes for AES-256
	CORSOrigin     string
	CookieSecure   bool
	AdminEmail     string
	AdminPassword  string
	AdminName      string
	ResendAPIKey   string
	AlertFromEmail string
	TelegramToken  string
	TelegramChatID string
}

func Load() (*Config, error) {
	_ = loadDotEnv()

	encHex := strings.TrimSpace(os.Getenv("ENCRYPTION_KEY"))
	key, err := decodeEncryptionKey(encHex)
	if err != nil {
		return nil, err
	}

	cfg := &Config{
		Addr:           getEnv("API_ADDR", ":8080"),
		DatabaseURL:    os.Getenv("DATABASE_URL"),
		AppEnv:         getEnv("APP_ENV", "development"),
		SessionSecret:  os.Getenv("SESSION_SECRET"),
		EncryptionKey:  key,
		CORSOrigin:     getEnv("CORS_ORIGIN", "http://localhost:3000"),
		CookieSecure:   getEnvBool("COOKIE_SECURE", false),
		AdminEmail:     getEnv("ADMIN_EMAIL", "admin@tgwealthvault.local"),
		AdminPassword:  getEnv("ADMIN_PASSWORD", "ChangeMeNow!123"),
		AdminName:      getEnv("ADMIN_NAME", "Admin"),
		ResendAPIKey:   os.Getenv("RESEND_API_KEY"),
		AlertFromEmail: os.Getenv("ALERT_FROM_EMAIL"),
		TelegramToken:  os.Getenv("TELEGRAM_BOT_TOKEN"),
		TelegramChatID: os.Getenv("TELEGRAM_CHAT_ID"),
	}

	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	if len(cfg.SessionSecret) < 32 {
		return nil, fmt.Errorf("SESSION_SECRET must be at least 32 characters")
	}
	return cfg, nil
}

func (c *Config) IsDev() bool {
	return c.AppEnv == "development" || c.AppEnv == "dev"
}

func getEnv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func getEnvBool(k string, def bool) bool {
	v := os.Getenv(k)
	if v == "" {
		return def
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return def
	}
	return b
}

func decodeEncryptionKey(hexOrRaw string) ([]byte, error) {
	if hexOrRaw == "" {
		return nil, fmt.Errorf("ENCRYPTION_KEY is required (64 hex chars = 32 bytes)")
	}
	// Prefer hex-encoded 32-byte key
	if len(hexOrRaw) == 64 {
		out := make([]byte, 32)
		for i := 0; i < 32; i++ {
			var b byte
			_, err := fmt.Sscanf(hexOrRaw[i*2:i*2+2], "%02x", &b)
			if err != nil {
				return nil, fmt.Errorf("invalid ENCRYPTION_KEY hex: %w", err)
			}
			out[i] = b
		}
		return out, nil
	}
	if len(hexOrRaw) == 32 {
		return []byte(hexOrRaw), nil
	}
	return nil, fmt.Errorf("ENCRYPTION_KEY must be 32 raw bytes or 64 hex characters")
}
