package services

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/tushg/TGWealthVault/api/internal/auth"
	"github.com/tushg/TGWealthVault/api/internal/crypto"
	"github.com/tushg/TGWealthVault/api/internal/models"
)

var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrMFARequired        = errors.New("mfa required")
	ErrMFAInvalid         = errors.New("invalid mfa code")
	ErrUserExists         = errors.New("user already exists")
	ErrForbidden          = errors.New("forbidden")
)

type AuthService struct {
	pool *pgxpool.Pool
	box  *crypto.Box
}

func NewAuthService(pool *pgxpool.Pool, box *crypto.Box) *AuthService {
	return &AuthService{pool: pool, box: box}
}

func (s *AuthService) EnsureAdmin(ctx context.Context, email, password, name string) error {
	var count int
	if err := s.pool.QueryRow(ctx, `SELECT COUNT(*) FROM users`).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		return err
	}
	_, err = s.pool.Exec(ctx, `
		INSERT INTO users (email, name, password_hash, role)
		VALUES ($1, $2, $3, 'admin')
	`, email, name, hash)
	return err
}

func (s *AuthService) Login(ctx context.Context, email, password, userAgent, ip string) (rawToken string, user *models.User, mfaPending bool, err error) {
	u, err := s.getUserByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", nil, false, ErrInvalidCredentials
		}
		return "", nil, false, err
	}
	if !u.IsActive || !auth.CheckPassword(u.PasswordHash, password) {
		return "", nil, false, ErrInvalidCredentials
	}

	raw, hash, err := auth.NewSessionToken()
	if err != nil {
		return "", nil, false, err
	}
	mfaVerified := !u.MFAEnabled
	ipHash := auth.HashIP(ip)
	_, err = s.pool.Exec(ctx, `
		INSERT INTO sessions (user_id, token_hash, mfa_verified, expires_at, user_agent, ip_hash)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, u.ID, hash, mfaVerified, time.Now().Add(7*24*time.Hour), nullStr(userAgent), ipHash)
	if err != nil {
		return "", nil, false, err
	}
	return raw, u, u.MFAEnabled, nil
}

func (s *AuthService) VerifyMFA(ctx context.Context, tokenHash, code string) error {
	sess, user, err := s.GetSessionByToken(ctx, tokenHash)
	if err != nil || sess == nil || user == nil {
		return ErrInvalidCredentials
	}
	if user.MFASecretEnc == nil {
		return ErrMFAInvalid
	}
	secret, err := s.box.DecryptString(*user.MFASecretEnc)
	if err != nil {
		return err
	}
	if !auth.ValidateTOTP(secret, code) {
		return ErrMFAInvalid
	}
	_, err = s.pool.Exec(ctx, `UPDATE sessions SET mfa_verified=TRUE WHERE id=$1`, sess.ID)
	return err
}

func (s *AuthService) SetupMFA(ctx context.Context, userID uuid.UUID, email string) (secret string, qr string, err error) {
	secret, qr, err = auth.GenerateTOTPSecret("TGWealthVault", email)
	if err != nil {
		return "", "", err
	}
	enc, err := s.box.EncryptString(secret)
	if err != nil {
		return "", "", err
	}
	_, err = s.pool.Exec(ctx, `UPDATE users SET mfa_secret_enc=$1, updated_at=NOW() WHERE id=$2`, enc, userID)
	return secret, qr, err
}

func (s *AuthService) EnableMFA(ctx context.Context, userID uuid.UUID, code string) error {
	var enc *string
	if err := s.pool.QueryRow(ctx, `SELECT mfa_secret_enc FROM users WHERE id=$1`, userID).Scan(&enc); err != nil {
		return err
	}
	if enc == nil {
		return fmt.Errorf("mfa not set up")
	}
	secret, err := s.box.DecryptString(*enc)
	if err != nil {
		return err
	}
	if !auth.ValidateTOTP(secret, code) {
		return ErrMFAInvalid
	}
	_, err = s.pool.Exec(ctx, `UPDATE users SET mfa_enabled=TRUE, updated_at=NOW() WHERE id=$1`, userID)
	return err
}

func (s *AuthService) Logout(ctx context.Context, tokenHash string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM sessions WHERE token_hash=$1`, tokenHash)
	return err
}

func (s *AuthService) GetSessionByToken(ctx context.Context, tokenHash string) (*models.Session, *models.User, error) {
	row := s.pool.QueryRow(ctx, `
		SELECT s.id, s.user_id, s.token_hash, s.mfa_verified, s.expires_at, s.created_at, s.user_agent, s.ip_hash,
		       u.id, u.email, u.name, u.password_hash, u.role, u.mfa_secret_enc, u.mfa_enabled, u.is_active, u.created_at, u.updated_at
		FROM sessions s
		JOIN users u ON u.id = s.user_id
		WHERE s.token_hash = $1
	`, tokenHash)

	var sess models.Session
	var user models.User
	err := row.Scan(
		&sess.ID, &sess.UserID, &sess.TokenHash, &sess.MFAVerified, &sess.ExpiresAt, &sess.CreatedAt, &sess.UserAgent, &sess.IPHash,
		&user.ID, &user.Email, &user.Name, &user.PasswordHash, &user.Role, &user.MFASecretEnc, &user.MFAEnabled, &user.IsActive, &user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil, nil
		}
		return nil, nil, err
	}
	return &sess, &user, nil
}

func (s *AuthService) CreateUser(ctx context.Context, actor *models.User, email, password, name, role string) (*models.User, error) {
	if actor == nil || actor.Role != "admin" {
		return nil, ErrForbidden
	}
	if role == "" {
		role = "member"
	}
	if err := auth.ValidatePasswordStrength(password); err != nil {
		return nil, err
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		return nil, err
	}
	var u models.User
	err = s.pool.QueryRow(ctx, `
		INSERT INTO users (email, name, password_hash, role)
		VALUES ($1, $2, $3, $4)
		RETURNING id, email, name, role, mfa_enabled, is_active, created_at, updated_at
	`, email, name, hash, role).Scan(&u.ID, &u.Email, &u.Name, &u.Role, &u.MFAEnabled, &u.IsActive, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		if stringsContainsUnique(err) {
			return nil, ErrUserExists
		}
		return nil, err
	}
	return &u, nil
}

func (s *AuthService) getUserByEmail(ctx context.Context, email string) (*models.User, error) {
	var u models.User
	err := s.pool.QueryRow(ctx, `
		SELECT id, email, name, password_hash, role, mfa_secret_enc, mfa_enabled, is_active, created_at, updated_at
		FROM users WHERE email=$1
	`, email).Scan(&u.ID, &u.Email, &u.Name, &u.PasswordHash, &u.Role, &u.MFASecretEnc, &u.MFAEnabled, &u.IsActive, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func nullStr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func stringsContainsUnique(err error) bool {
	return err != nil && (contains(err.Error(), "unique") || contains(err.Error(), "duplicate"))
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(sub) == 0 ||
		(func() bool {
			for i := 0; i+len(sub) <= len(s); i++ {
				if s[i:i+len(sub)] == sub {
					return true
				}
			}
			return false
		})())
}
