package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"golang.org/x/time/rate"

	"github.com/tushg/TGWealthVault/api/internal/config"
	"github.com/tushg/TGWealthVault/api/internal/crypto"
	"github.com/tushg/TGWealthVault/api/internal/db"
	"github.com/tushg/TGWealthVault/api/internal/handlers"
	"github.com/tushg/TGWealthVault/api/internal/middleware"
	"github.com/tushg/TGWealthVault/api/internal/services"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	ctx := context.Background()
	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db: %v", err)
	}
	defer pool.Close()

	if err := db.Migrate(ctx, pool); err != nil {
		log.Fatalf("migrate: %v", err)
	}

	box, err := crypto.NewBox(cfg.EncryptionKey)
	if err != nil {
		log.Fatalf("crypto: %v", err)
	}

	authSvc := services.NewAuthService(pool, box)
	if err := authSvc.EnsureAdmin(ctx, cfg.AdminEmail, cfg.AdminPassword, cfg.AdminName); err != nil {
		log.Fatalf("seed admin: %v", err)
	}

	finSvc := services.NewFinanceService(pool)
	mfSvc := services.NewMFService(pool, box, "uploads")
	api := &handlers.API{Cfg: cfg, Auth: authSvc, Finance: finSvc, MF: mfSvc}

	authLimiter := middleware.NewIPRateLimiter(rate.Every(time.Minute/10), 20) // ~10/min, burst 20

	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.Timeout(60 * time.Second))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{cfg.CORSOrigin},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Get("/health", api.Health)

	r.Route("/api/v1", func(r chi.Router) {
		r.Group(func(r chi.Router) {
			r.Use(authLimiter.Middleware)
			r.Post("/auth/login", api.Login)
			r.Post("/auth/mfa/verify", api.VerifyMFA)
		})

		r.Group(func(r chi.Router) {
			r.Use(middleware.RequireAuth(authSvc, false))
			r.Post("/auth/logout", api.Logout)
			r.Get("/auth/me", api.Me)
			r.Post("/auth/mfa/setup", api.SetupMFA)
			r.Post("/auth/mfa/enable", api.EnableMFA)
		})

		r.Group(func(r chi.Router) {
			r.Use(middleware.RequireAuth(authSvc, true))
			r.Get("/dashboard", api.Dashboard)
			r.Get("/portfolio", api.Portfolio)
			r.Get("/persons", api.ListPersons)
			r.Post("/persons", api.CreatePerson)
			r.Get("/deposits", api.ListDeposits)
			r.Post("/deposits", api.CreateDeposit)
			r.Delete("/deposits/{id}", api.DeleteDeposit)
			r.Post("/deposits/{id}/mature", api.MarkDepositMatured)
			r.Get("/goals", api.ListGoals)
			r.Post("/goals", api.CreateGoal)
			r.Get("/mf", api.ListMF)
			r.Post("/mf", api.CreateMF)
			r.Post("/mf/import", api.ImportMFStatement)
			r.Get("/mf/statements", api.ListStatements)
			r.Get("/policies", api.ListPolicies)
			r.Post("/policies", api.CreatePolicy)
			r.Get("/cashflow", api.ListCashflow)
			r.Post("/cashflow", api.CreateCashflow)
			r.Post("/users", api.CreateUser)
		})
	})

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("TGWealthVault API listening on %s (env=%s)", cfg.Addr, cfg.AppEnv)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("serve: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
}
