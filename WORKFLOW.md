# TGWealthVault — Personal Finance Workflow

Inspired by [Value Research Portfolio Manager](https://www.valueresearchonline.com/my-investments/) and bank goal-based wealth UIs.

## Operating loop

```
Import → Assess → Allocate → Aim → Protect → Operate → Review
```

| Step | Screen | Purpose |
|------|--------|---------|
| **Import** | `/import` | Upload CAMS/KFin CAS PDF or CSV; map family member |
| **Assess** | `/portfolio` | Net worth, asset mix, attention items (maturities, gaps) |
| **Allocate** | `/mutual-funds`, `/deposits` | Holdings ledger + FD/RD book |
| **Aim** | `/goals` | Goal templates (Home, Education, Retirement, Emergency, Wedding) with funding % |
| **Protect** | `/policies` | Life/health/term cover register + premium dues |
| **Operate** | `/cashflow` | Monthly income vs expense, surplus for investing |
| **Review** | Portfolio + alerts | Rebalance cues, statement freshness |

## Goal-specific UX

Each goal is a **mission card**: target date, corpus needed, funded amount, linked assets, gap, and suggested monthly SIP/FD contribution.

## Design principles (this product)

- One portfolio command center (not a card dump)
- Dense, trustworthy data tables (folio / units / value / weight %)
- Clear hierarchy: brand → net worth → allocation → actions
- Light institutional surfaces (research-desk feel), navy ink, precise typography
