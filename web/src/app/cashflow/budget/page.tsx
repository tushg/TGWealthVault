"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { api, ExpenseBudget } from "@/lib/api";
import { formatINR } from "@/lib/format";
import { useSession } from "@/lib/useSession";

const SUGGESTIONS = [
  { name: "School fees", amount: "15000" },
  { name: "RD", amount: "5000" },
  { name: "Medicine", amount: "3000" },
  { name: "Vegetable", amount: "4000" },
];

export default function ExpenseBudgetPage() {
  const { user, loading } = useSession();
  const [items, setItems] = useState<ExpenseBudget[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ExpenseBudget | null>(null);

  async function load() {
    setItems((await api.expenseBudgets()) || []);
  }

  useEffect(() => {
    if (user) load().catch((e) => setError(e.message));
  }, [user]);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      if (editing) {
        await api.updateExpenseBudget(editing.id, {
          name: String(fd.get("name") || "").trim(),
          allocated_amount: String(fd.get("allocated_amount") || "0"),
          notes: String(fd.get("notes") || "") || null,
          active: fd.get("active") === "on",
        });
        setEditing(null);
      } else {
        await api.createExpenseBudget({
          name: String(fd.get("name") || "").trim(),
          allocated_amount: String(fd.get("allocated_amount") || "0"),
          notes: String(fd.get("notes") || "") || null,
          active: true,
        });
      }
      e.currentTarget.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function seedSuggestion(name: string, amount: string) {
    setError(null);
    try {
      await api.createExpenseBudget({ name, allocated_amount: amount, active: true });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add");
    }
  }

  if (loading || !user) return <div className="min-h-screen grid place-items-center text-[var(--muted)]">Loading…</div>;

  const total = items.filter((i) => i.active).reduce((s, i) => s + (Number(i.allocated_amount) || 0), 0);

  return (
    <AppShell
      userName={user.name}
      title="Expense Budget"
      subtitle="Master list of planned monthly expenses and how much you allocate to each."
      actions={
        <div className="flex gap-2">
          <Link href="/cashflow" className="btn-ghost">Cashflow</Link>
          <Link href="/cashflow/expense-report" className="btn-primary">Expense Report</Link>
        </div>
      }
    >
      <div className="kpi mb-6 max-w-sm">
        <div className="text-xs uppercase tracking-wider text-[var(--muted)]">Monthly budget total</div>
        <div className="text-2xl mt-1 tabular-nums" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>{formatINR(total)}</div>
      </div>

      {error && <p className="text-[var(--danger)] text-sm mb-4">{error}</p>}

      {items.length === 0 && (
        <div className="panel p-5 mb-6">
          <p className="text-sm text-[var(--muted)] mb-3">Quick-add common expenses:</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s.name} type="button" className="btn-ghost text-sm" onClick={() => seedSuggestion(s.name, s.amount)}>
                {s.name} · {formatINR(s.amount)}
              </button>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={onCreate} className="panel p-5 mb-6 grid gap-3 sm:grid-cols-4">
        <label className="sm:col-span-2">
          <span className="label">{editing ? "Edit expense name" : "Expense name"}</span>
          <input className="field" name="name" required defaultValue={editing?.name || ""} key={editing?.id || "new"} placeholder="School fees / RD / Medicine" />
        </label>
        <label>
          <span className="label">Monthly allocation ₹</span>
          <input className="field" name="allocated_amount" type="number" step="0.01" required defaultValue={editing?.allocated_amount || ""} key={`amt-${editing?.id || "new"}`} />
        </label>
        <label>
          <span className="label">Notes</span>
          <input className="field" name="notes" defaultValue={editing?.notes || ""} key={`notes-${editing?.id || "new"}`} placeholder="Optional" />
        </label>
        {editing && (
          <label className="text-sm flex items-center gap-2 sm:col-span-2">
            <input type="checkbox" name="active" defaultChecked={editing.active} /> Active
          </label>
        )}
        <div className="flex items-end gap-2 sm:col-span-2">
          <button className="btn-primary" type="submit">{editing ? "Update" : "Add expense"}</button>
          {editing && (
            <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
          )}
        </div>
      </form>

      <div className="panel overflow-x-auto">
        <table className="table-pro">
          <thead>
            <tr>
              <th>Expense</th>
              <th>Monthly allocation</th>
              <th>Status</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={5} className="text-[var(--muted)]">No budget items yet.</td></tr>
            ) : items.map((b) => (
              <tr key={b.id}>
                <td className="font-medium">{b.name}</td>
                <td className="tabular-nums font-semibold">{formatINR(b.allocated_amount)}</td>
                <td>{b.active ? "Active" : "Inactive"}</td>
                <td className="text-[var(--muted)] text-sm">{b.notes || "—"}</td>
                <td className="space-x-2">
                  <button type="button" className="btn-ghost text-xs py-1 px-2" onClick={() => setEditing(b)}>Edit</button>
                  <button
                    type="button"
                    className="btn-ghost text-xs py-1 px-2 text-[var(--danger)] border-[rgba(180,35,24,0.35)]"
                    onClick={async () => {
                      if (!confirm(`Delete "${b.name}"?`)) return;
                      await api.deleteExpenseBudget(b.id);
                      await load();
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
