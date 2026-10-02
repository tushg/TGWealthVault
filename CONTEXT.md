# TGWealthVault - Initial Context Prompt

## Role
You are building **TGWealthVault**, a personal finance web application for an Indian resident.
Personal/family use only, publicly reachable via URL, free hosting tiers, highly sensitive financial data.

## Hosting (public + secure)
| Layer | Service | Notes |
|-------|---------|--------|
| Website (UI) | **Vercel** (Hobby / free) | Public HTTPS URL (`*.vercel.app`) — Next.js frontend only |
| API (backend) | **Render** or **Fly.io** (free tier) | Go HTTP API; private DB connection over TLS |
| Database | **Neon** Postgres (Free) | Private; only the Go API connects via TLS |
| Secrets | Vercel + Render/Fly env vars | Never commit secrets |

Access: open site from anywhere → sign in → see data. **No public signup** (invite/admin-provisioned users only).

## Tech stack (locked)
### Frontend (`web/`)
- **Next.js** (App Router) + TypeScript
- Tailwind CSS + shadcn/ui
- Recharts (dashboards & charts)
- Talks only to the Go API over HTTPS (no direct DB access from the browser)

### Backend (`api/`)
- **Go 1.25** (match local `go version`)
- Chi router, pgx (Postgres), golang-migrate
- Session cookie auth + TOTP MFA (no open signup)
- AES-256-GCM field encryption for sensitive data; encrypted PDF storage
- Rate-limited auth endpoints
- Cron-style jobs for maturity alerts (Render cron / Fly machines / GitHub Actions later)
- Email via Resend and/or Telegram bot alerts

### Data
- Neon Postgres (local: Docker Compose Postgres for development)

## Features
- FD/RD tracking + maturity alerts
- Mutual fund portfolio via CAMS/KFin PDF parsing
- Goals + asset linking + graphs
- Insurance/policies
- Monthly income/expense
- Person / family tagging
- Secure persistence, polished enterprise-grade UI

## Security
- AES-GCM for sensitive fields at rest
- Encrypt uploaded PDFs
- MFA (TOTP) required for privileged sessions
- Rate-limit auth
- No secrets or PII in logs
- Stay on free tiers (Vercel Hobby + Neon Free + Render/Fly free) unless asked to upgrade

## Development workflow
1. **Build and run entirely locally first** (Go API + Next.js + local Postgres).
2. Use the machine’s installed Go version (`go1.25.x`) — do not upgrade Go unless asked.
3. When the full application is complete, **ask before deploying** to Vercel + Neon + Render/Fly.
4. Commit and push to: https://github.com/tushg/TGWealthVault

## UI direction
UI must feel excellent — clear, useful dashboards and charts. Draw inspiration from leading personal-finance products (Groww, Zerodha Console, Mint/YNAB-style clarity) without copying proprietary assets. Prefer one composed dashboard hierarchy, strong typography, and purposeful motion — not a generic card-grid template.
