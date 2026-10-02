package middleware

import (
	"context"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"

	"github.com/tushg/TGWealthVault/api/internal/auth"
	"github.com/tushg/TGWealthVault/api/internal/models"
)

type ctxKey string

const (
	CtxUserKey    ctxKey = "user"
	CtxSessionKey ctxKey = "session"
)

type SessionStore interface {
	GetSessionByToken(ctx context.Context, tokenHash string) (*models.Session, *models.User, error)
}

func ClientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		return strings.TrimSpace(parts[0])
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func RequireAuth(store SessionStore, requireMFA bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			c, err := r.Cookie(auth.SessionCookieName)
			if err != nil || c.Value == "" {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}
			sess, user, err := store.GetSessionByToken(r.Context(), auth.HashToken(c.Value))
			if err != nil || sess == nil || user == nil || !user.IsActive {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}
			if time.Now().After(sess.ExpiresAt) {
				http.Error(w, `{"error":"session expired"}`, http.StatusUnauthorized)
				return
			}
			if requireMFA && user.MFAEnabled && !sess.MFAVerified {
				http.Error(w, `{"error":"mfa_required"}`, http.StatusForbidden)
				return
			}
			ctx := context.WithValue(r.Context(), CtxUserKey, user)
			ctx = context.WithValue(ctx, CtxSessionKey, sess)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func UserFromContext(ctx context.Context) *models.User {
	u, _ := ctx.Value(CtxUserKey).(*models.User)
	return u
}

func SessionFromContext(ctx context.Context) *models.Session {
	s, _ := ctx.Value(CtxSessionKey).(*models.Session)
	return s
}

// IPRateLimiter is a simple per-IP token bucket for auth endpoints.
type IPRateLimiter struct {
	mu       sync.Mutex
	limiters map[string]*rate.Limiter
	r        rate.Limit
	b        int
}

func NewIPRateLimiter(r rate.Limit, b int) *IPRateLimiter {
	return &IPRateLimiter{limiters: make(map[string]*rate.Limiter), r: r, b: b}
}

func (l *IPRateLimiter) get(ip string) *rate.Limiter {
	l.mu.Lock()
	defer l.mu.Unlock()
	lim, ok := l.limiters[ip]
	if !ok {
		lim = rate.NewLimiter(l.r, l.b)
		l.limiters[ip] = lim
	}
	return lim
}

func (l *IPRateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := ClientIP(r)
		if !l.get(ip).Allow() {
			http.Error(w, `{"error":"too many requests"}`, http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}
