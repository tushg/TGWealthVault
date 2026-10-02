"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api, CashflowEntry } from "@/lib/api";
import { formatINR } from "@/lib/format";
import { useSession } from "@/lib/useSession";

export default function CashflowPage() {
  const { user, loading } = useSession();
  const [items, setItems] = useState<CashflowEntry[]>([]);

  async function load() {
    setItems((await api.cashflow()) || []);
  }
  useEffect(() => {
    if (user) load().catch(() => undefined);
  }, [user]);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const month = String(fd.get("entry_month") || "");
    await api.createCashflow({
      type: fd.get("type"),
      category: fd.get("category"),
      amount: fd.get("amount"),
      entry_month: new Date(`${month}-01`).toISOString(),
      recurring: fd.get("recurring") === "on",
    });
    e.currentTarget.reset();
    await load();
  }

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const e of items) {
      if (e.type === "income") income += Number(e.amount) || 0;
      else expense += Number(e.amount) || 0;
    }
    return { income, expense, surplus: income - expense };
  }, [items]);

  if (loading || !user) return <div className="min-h-screen grid place-items-center text-[var(--muted)]">Loading…</div>;

  return (
    <AppShell
      userName={user.name}
      title="Cashflow"
      subtitle="Monthly operating ledger — surplus feeds your goal contributions."
    >
      <div className="grid sm:grid-cols-3 gap-3 mb-6">
        <div className="kpi"><div className="text-xs uppercase tracking-wider text-[var(--muted)]">Income</div><div className="text-2xl mt-1 tabular-nums text-[var(--accent)]" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>{formatINR(totals.income)}</div></div>
        <div className="kpi"><div className="text-xs uppercase tracking-wider text-[var(--muted)]">Expense</div><div className="text-2xl mt-1 tabular-nums text-[var(--warn)]" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>{formatINR(totals.expense)}</div></div>
        <div className="kpi"><div className="text-xs uppercase tracking-wider text-[var(--muted)]">Surplus</div><div className="text-2xl mt-1 tabular-nums" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>{formatINR(totals.surplus)}</div></div>
      </div>

      <form onSubmit={onCreate} className="panel p-5 mb-6 grid gap-3 sm:grid-cols-5">
        <label><span className="label">Type</span><select className="field" name="type"><option value="income">Income</option><option value="expense">Expense</option></select></label>
        <label><span className="label">Category</span><input className="field" name="category" required placeholder="Salary / Rent / SIP" /></label>
        <label><span className="label">Amount ₹</span><input className="field" name="amount" type="number" required /></label>
        <label><span className="label">Month</span><input className="field" name="entry_month" type="month" required defaultValue={new Date().toISOString().slice(0, 7)} /></label>
        <div className="flex items-end gap-3">
          <label className="text-sm flex items-center gap-2"><input type="checkbox" name="recurring" /> Recurring</label>
          <button className="btn-primary" type="submit">Add</button>
        </div>
      </form>

      <div className="panel overflow-x-auto">
        <table className="table-pro">
          <thead><tr><th>Month</th><th>Type</th><th>Category</th><th>Amount</th><th>Recurring</th><th></th></tr></thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={6} className="text-[var(--muted)]">No cashflow entries yet.</td></tr>
            ) : items.map((e) => (
              <tr key={e.id}>
                <td>{new Date(e.entry_month).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</td>
                <td className="capitalize">{e.type}</td>
                <td>{e.category}</td>
                <td className="tabular-nums font-semibold">{formatINR(e.amount)}</td>
                <td>{e.recurring ? "Yes" : "No"}</td>
                <td>
                  <button type="button" className="btn-ghost text-xs py-1 px-2 text-[var(--danger)] border-[rgba(180,35,24,0.35)]" onClick={async () => {
                    if (!confirm("Delete this entry?")) return;
                    await api.deleteCashflow(e.id);
                    await load();
                  }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
