# TGWealthVault — Project Context

Living context for humans and AI agents working on this repo. Keep this file updated when major behaviour or architecture changes.

**Repo:** https://github.com/tushg/TGWealthVault  
**Product name:** TGWealthVault  
**Audience:** Personal/family use (Indian resident context); invite-only, no public signup.

---

## Role & constraints

- Personal finance web app for an Indian household.
- Publicly reachable later via URL; free hosting tiers; highly sensitive financial data.
- **Local-first development.** Deploy only after explicit user confirmation.
- Use the machine’s installed **Go 1.25.x** — do not upgrade Go unless asked.
- Default local API port is **8081** (8080 often used by Jenkins locally).
- Never commit `.env`, credentials, or real financial PII.

---

## Hosting plan (later)

| Layer | Service | Notes |
|-------|---------|--------|
| Website (UI) | **Vercel** (Hobby) | Public HTTPS; Next.js only |
| API | **Render** or **Fly.io** (free) | Go HTTP API; private DB over TLS |
| Database | **Neon** Postgres (Free) | API-only access |
| Secrets | Platform env vars | Never in git |

Access path: open site → sign in → data. Admin-provisioned users only.

---

## Tech stack

### Frontend (`web/`)
- Next.js App Router + TypeScript + Tailwind
- Recharts for dashboards / expense report
- Client talks only to Go API (`NEXT_PUBLIC_API_URL`, default `http://localhost:8081`)
- Auth: session cookie via API; `useSession` guard on pages

### Backend (`api/`)
- Go 1.25, Chi router, pgx, embedded SQL migrations (`api/internal/db/migrations/`)
- Session cookie auth + TOTP MFA
- AES-256-GCM for sensitive fields / uploaded statements
- Rate-limited auth endpoints
- Optional Resend / Telegram alerts (env)

### Data
- Local: Docker Compose Postgres (`tgwealth` / `tgwealthvault`)
- Prod target: Neon

---

## Local run

```powershell
copy .env.example .env
docker compose up -d

cd api
go run ./cmd/server

# other terminal
cd web
npm install
npm run dev
```

- UI: http://localhost:3000  
- API health: http://localhost:8081/health  
- Default admin (from `.env.example`): `admin@tgwealthvault.local` / `ChangeMeNow!123`

If the browser shows stale UI after big frontend changes: stop `npm run dev`, clear `web/.next`, restart, hard-refresh.

---

## Product workflow (screens)

Inspired by Value Research / bank goal-desk UIs. See also `WORKFLOW.md`.

| Step | Route | Purpose |
|------|-------|---------|
| Import | `/import` | CAMS/KFin CAS PDF, CSV, or pasted Portfolio Summary |
| Assess | `/portfolio`, `/dashboard` | Net worth, mix, attention items |
| Allocate | `/mutual-funds`, `/deposits` | MF ledger + FD/RD book + goal tags |
| Aim | `/goals` | Missions; attach MF / FD / RD; edit target |
| Protect | `/policies` | Insurance register |
| Operate | `/cashflow`, `/cashflow/budget`, `/cashflow/expense-report` | Income/expense, budgets, reports |
| Review | `/alerts` | Maturity / attention confirmations |
| People | `/people` | Family member tagging |
| Settings | `/settings` | Account / MFA |

---

## Feature status (as of 2026-10-02)

### Mutual funds / CAS
- Import CAMS/KFin statements; Portfolio Summary text parsing preferred when pasted.
- Holdings + transactions; replace-on-reimport behaviour for same source statement.
- Delete MF clears related goal links.
- Key files: `api/internal/mfparse/`, `api/internal/services/mf.go`, `web/src/app/mutual-funds/`, `web/src/app/import/`

### Deposits (FD / RD)
- Create with optional FD number, principal, rate, maturity amount/date.
- Active vs matured filters; mark matured; delete.
- **Tagged goal** column (same one-goal rule as MF).
- Key files: `web/src/app/deposits/page.tsx`, deposit handlers in `finance.go`

### Goals & asset linking
- Create / update goals (flexible amounts/dates); target slider on create + edit.
- Attach investments: MF, FD, RD, other deposits (`mf:{id}` / `deposit:{id}`).
- Linked value drives `goals.current_amount` via `refreshGoalFunding`.
- **Rule: one investment → at most one goal.**
  - Enforced in `LinkGoalAsset` with clear error naming the other goal.
  - DB: unique index `goal_assets_one_goal_per_asset` on `(asset_type, asset_id)` — migration `007_goal_asset_unique.sql` (also dedupes existing rows).
  - UI: Goals attach dropdown excludes globally linked assets; MF + Deposits show single tagged goal + unlink.
- Key files: `api/internal/services/goals_link.go`, `web/src/app/goals/page.tsx`

### Cashflow & expenses
- Cashflow list with month filter (`YYYY-MM` on API + client-side filter / stale-request guard).
- Expense budgets CRUD: `/cashflow/budget`
- Expense report (ranges, growth, charts, top deviations): `/cashflow/expense-report`
- Demo seed: `POST /api/v1/expense-report/demo-data`
- Migration: `006_expense_budgets.sql`
- Key files: `api/internal/services/expense_budget.go`, cashflow pages under `web/src/app/cashflow/`

### Alerts
- Deposit maturity alerts; confirm workflow; matured-on-create alert when past maturity.

### Auth / security
- Invite-only; seeded admin from env.
- MFA setup/enable endpoints; encrypt sensitive fields and uploaded PDFs.
- No secrets in logs.

---

## Important API surface

Base: `/api/v1` (auth cookie required except login/MFA verify/health).

Notable routes:
- Goals: `GET/POST /goals`, `PUT/DELETE /goals/{id}`, `GET/POST /goals/{id}/assets`, `DELETE /goals/{id}/assets/{assetType}/{assetId}`, `GET /goal-assets`
- MF: `GET/POST /mf`, `DELETE /mf/{id}`, `POST /mf/import`, transactions/statements
- Deposits: `GET/POST /deposits`, `DELETE /deposits/{id}`, `POST /deposits/{id}/mature`
- Cashflow: `GET/POST/DELETE /cashflow`
- Expense: `CRUD /expense-budgets`, `GET /expense-report`, `POST /expense-report/demo-data`

Client wrappers: `web/src/lib/api.ts`

---

## Database migrations

Embedded under `api/internal/db/migrations/` (applied on API start via `schema_migrations`).

| File | Purpose |
|------|---------|
| `001_init.sql` | Core schema (persons, deposits, mf, goals, `goal_assets`, policies, cashflow, …) |
| `002`–`005` | Portfolio enrich, FD number, alerts, MF transactions |
| `006_expense_budgets.sql` | Expense budgets; optional `cashflow_entries.budget_id` |
| `007_goal_asset_unique.sql` | One goal per investment unique index + dedupe |

`goal_assets` PK remains `(goal_id, asset_type, asset_id)`; uniqueness of asset across goals is the extra unique index.

---

## UI / design notes

- Institutional research-desk feel: navy ink, precise typography, dense tables — not generic purple card grids.
- Prefer one composed command centre hierarchy over card dumps.
- Goal pages: mission cards with funding %, linked investments, attach dropdown.
- Shared styles: `web/src/app/globals.css` (includes `.goal-slider`, table/panel utilities).
- Nav: `web/src/components/AppShell.tsx`

When doing **new branded/landing** surfaces, follow Cursor frontend design rules (expressive fonts, atmospheric backgrounds, brand-first hero). For **in-app portfolio screens**, preserve the existing institutional system.

---

## Agent / coding conventions for this repo

1. Prefer fixing behaviour in API + existing pages over new frameworks.
2. Match existing Go (`services` + `handlers` + Chi routes) and Next page patterns.
3. After schema changes, add a numbered migration under `api/internal/db/migrations/`.
4. Restart API after migration adds so embeds apply.
5. Commit only when the user asks; push only when asked. Message style is short “why”-focused sentences (see recent `main` history).
6. Do not force-push `main` or skip hooks unless explicitly requested.
7. PowerShell: use `;` not `&&`; prefer here-strings for multi-line commit messages.

---

## Recent shipped work (checkpoint)

Commit on `main` around this context refresh (`7d0fdf0` and follow-ups):
- Goal ↔ investment linking (Goals, MF, Deposits) with one-goal-per-asset validation + DB unique index
- Goal create/update reliability + target slider
- CAMS Portfolio Summary parse path
- Expense budgets + expense report + demo data
- Cashflow month filter hardening
- Deposits tagged-goal column (FD/RD)

---

## Open / known follow-ups (optional)

- Clear `goal_assets` when deleting a deposit (MF delete already clears links).
- Production deploy (Vercel + Neon + Render/Fly) — **ask user first**.
- Alert delivery (Resend/Telegram) wiring beyond local stubs.
- Hardening MFA UX and invite-user flow for non-admin household members.

---

## Related docs

- `README.md` — quick start  
- `WORKFLOW.md` — Import → Assess → Allocate → Aim → Protect → Operate  
- `web/AGENTS.md` / `web/CLAUDE.md` — frontend agent notes if present  
