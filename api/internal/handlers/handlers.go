package handlers

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/tushg/TGWealthVault/api/internal/auth"
	"github.com/tushg/TGWealthVault/api/internal/config"
	"github.com/tushg/TGWealthVault/api/internal/middleware"
	"github.com/tushg/TGWealthVault/api/internal/services"
)

type API struct {
	Cfg     *config.Config
	Auth    *services.AuthService
	Finance *services.FinanceService
	MF      *services.MFService
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func (a *API) Health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "tgwealthvault-api"})
}

type loginReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (a *API) Login(w http.ResponseWriter, r *http.Request) {
	var req loginReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	token, user, mfaPending, err := a.Auth.Login(r.Context(), req.Email, req.Password, r.UserAgent(), middleware.ClientIP(r))
	if err != nil {
		if errors.Is(err, services.ErrInvalidCredentials) {
			writeErr(w, http.StatusUnauthorized, "invalid credentials")
			return
		}
		writeErr(w, http.StatusInternalServerError, "login failed")
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     auth.SessionCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   a.Cfg.CookieSecure,
		SameSite: http.SameSiteLaxMode,
		Expires:  time.Now().Add(7 * 24 * time.Hour),
	})
	writeJSON(w, http.StatusOK, map[string]any{
		"user":        user,
		"mfa_pending": mfaPending,
	})
}

type mfaReq struct {
	Code string `json:"code"`
}

func (a *API) VerifyMFA(w http.ResponseWriter, r *http.Request) {
	c, err := r.Cookie(auth.SessionCookieName)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req mfaReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	if err := a.Auth.VerifyMFA(r.Context(), auth.HashToken(c.Value), req.Code); err != nil {
		writeErr(w, http.StatusUnauthorized, "invalid mfa code")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (a *API) Logout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(auth.SessionCookieName); err == nil {
		_ = a.Auth.Logout(r.Context(), auth.HashToken(c.Value))
	}
	http.SetCookie(w, &http.Cookie{
		Name:     auth.SessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   a.Cfg.CookieSecure,
		MaxAge:   -1,
	})
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (a *API) Me(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromContext(r.Context())
	sess := middleware.SessionFromContext(r.Context())
	writeJSON(w, http.StatusOK, map[string]any{
		"user":         user,
		"mfa_verified": sess != nil && sess.MFAVerified,
	})
}

func (a *API) SetupMFA(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromContext(r.Context())
	secret, qr, err := a.Auth.SetupMFA(r.Context(), user.ID, user.Email)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "mfa setup failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{
		"secret":     secret,
		"qr_png_b64": qr,
	})
}

func (a *API) EnableMFA(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromContext(r.Context())
	var req mfaReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	if err := a.Auth.EnableMFA(r.Context(), user.ID, req.Code); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid mfa code")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "enabled"})
}

type createUserReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
	Role     string `json:"role"`
}

func (a *API) CreateUser(w http.ResponseWriter, r *http.Request) {
	actor := middleware.UserFromContext(r.Context())
	var req createUserReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	u, err := a.Auth.CreateUser(r.Context(), actor, req.Email, req.Password, req.Name, req.Role)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrForbidden):
			writeErr(w, http.StatusForbidden, "forbidden")
		case errors.Is(err, services.ErrUserExists):
			writeErr(w, http.StatusConflict, "user exists")
		default:
			writeErr(w, http.StatusBadRequest, err.Error())
		}
		return
	}
	writeJSON(w, http.StatusCreated, u)
}

func (a *API) Dashboard(w http.ResponseWriter, r *http.Request) {
	sum, err := a.Finance.Dashboard(r.Context())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "failed")
		return
	}
	writeJSON(w, http.StatusOK, sum)
}

func (a *API) Portfolio(w http.ResponseWriter, r *http.Request) {
	p, err := a.Finance.Portfolio(r.Context())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "failed")
		return
	}
	writeJSON(w, http.StatusOK, p)
}

func (a *API) ListPersons(w http.ResponseWriter, r *http.Request) {
	items, err := a.Finance.ListPersons(r.Context())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "failed")
		return
	}
	if items == nil {
		writeJSON(w, http.StatusOK, []any{})
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *API) CreatePerson(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name     string  `json:"name"`
		Relation *string `json:"relation"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		writeErr(w, http.StatusBadRequest, "name required")
		return
	}
	p, err := a.Finance.CreatePerson(r.Context(), req.Name, req.Relation)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "failed")
		return
	}
	writeJSON(w, http.StatusCreated, p)
}

func (a *API) ListDeposits(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	items, err := a.Finance.ListDeposits(r.Context(), status)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "failed")
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *API) CreateDeposit(w http.ResponseWriter, r *http.Request) {
	var in services.CreateDepositInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	d, err := a.Finance.CreateDeposit(r.Context(), in)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, d)
}

func (a *API) DeleteDeposit(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := a.Finance.DeleteDeposit(r.Context(), id); err != nil {
		writeErr(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (a *API) MarkDepositMatured(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	d, err := a.Finance.MarkDepositMatured(r.Context(), id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "deposit not found")
		return
	}
	writeJSON(w, http.StatusOK, d)
}

func (a *API) ListGoals(w http.ResponseWriter, r *http.Request) {
	items, err := a.Finance.ListGoals(r.Context())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "failed")
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *API) CreateGoal(w http.ResponseWriter, r *http.Request) {
	var in services.CreateGoalInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	g, err := a.Finance.CreateGoal(r.Context(), in)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, g)
}

func (a *API) ListMF(w http.ResponseWriter, r *http.Request) {
	items, err := a.Finance.ListMF(r.Context())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "failed")
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *API) ListPolicies(w http.ResponseWriter, r *http.Request) {
	items, err := a.Finance.ListPolicies(r.Context())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "failed")
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *API) ListCashflow(w http.ResponseWriter, r *http.Request) {
	items, err := a.Finance.ListCashflow(r.Context())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "failed")
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *API) CreateCashflow(w http.ResponseWriter, r *http.Request) {
	var in services.CreateCashflowInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	e, err := a.Finance.CreateCashflow(r.Context(), in)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, e)
}

func (a *API) CreatePolicy(w http.ResponseWriter, r *http.Request) {
	var in services.CreatePolicyInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	p, err := a.Finance.CreatePolicy(r.Context(), in)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, p)
}

func (a *API) CreateMF(w http.ResponseWriter, r *http.Request) {
	var in services.CreateMFInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	h, err := a.MF.CreateHolding(r.Context(), in)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, h)
}

func (a *API) ListStatements(w http.ResponseWriter, r *http.Request) {
	items, err := a.MF.ListStatements(r.Context())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "failed")
		return
	}
	if items == nil {
		writeJSON(w, http.StatusOK, []any{})
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *API) ImportMFStatement(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid multipart form")
		return
	}
	source := r.FormValue("source")
	password := r.FormValue("password")
	textFallback := r.FormValue("text")
	var personID *uuid.UUID
	if pid := r.FormValue("person_id"); pid != "" {
		id, err := uuid.Parse(pid)
		if err == nil {
			personID = &id
		}
	}

	var fileBytes []byte
	filename := "statement.txt"
	file, header, err := r.FormFile("file")
	if err == nil {
		defer file.Close()
		filename = header.Filename
		fileBytes, err = io.ReadAll(file)
		if err != nil {
			writeErr(w, http.StatusBadRequest, "could not read file")
			return
		}
	} else if textFallback == "" {
		writeErr(w, http.StatusBadRequest, "file or text required")
		return
	} else {
		fileBytes = []byte(textFallback)
		filename = "pasted-cas.txt"
	}

	res, err := a.MF.ImportStatement(r.Context(), personID, source, filename, password, fileBytes, textFallback)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "import failed")
		return
	}
	status := http.StatusOK
	if res.Status == "failed" {
		status = http.StatusUnprocessableEntity
	}
	writeJSON(w, status, res)
}
