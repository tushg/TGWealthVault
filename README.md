# TGWealthVault

Personal/family finance vault for an Indian resident. **Next.js** UI + **Go 1.25** API + **Postgres**.

> Full product context: see [CONTEXT.md](./CONTEXT.md)

## Architecture

```
web/   → Next.js (App Router) + TypeScript + Tailwind  →  Vercel (later)
api/   → Go 1.25 HTTP API (Chi + pgx + AES-GCM + MFA) →  Render/Fly (later)
db     → Postgres (local Docker now; Neon Free later)
```

No public signup. Admin is seeded from env. Sensitive fields encrypted with AES-256-GCM.

## Local prerequisites

- Go **1.25.x** (this machine: `go1.25.0`)
- Node.js 20+
- Docker Desktop (for Postgres)

## Quick start

```powershell
# 1) Env
copy .env.example .env

# 2) Database
docker compose up -d

# 3) API (from repo root)
cd api
go mod tidy
go run ./cmd/server

# 4) Web (new terminal)
cd web
npm install
npm run dev
```

- UI: http://localhost:3000  
- API health: http://localhost:8081/health (8080 often used by Jenkins locally)
- Default admin (change in `.env`): `admin@tgwealthvault.local` / `ChangeMeNow!123`

## Repository

https://github.com/tushg/TGWealthVault

## Deploy

Local-first. When the app is complete, we will deploy UI → Vercel, API → Render/Fly, DB → Neon — **only after you confirm**.
