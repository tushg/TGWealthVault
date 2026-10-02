"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api, Deposit } from "@/lib/api";
import { formatINR } from "@/lib/format";
import { useSession } from "@/lib/useSession";

export default function DepositsPage() {
  const { user, loading } = useSession();
  const [items, setItems] = useState<Deposit[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setItems((await api.deposits()) || []);
  }

  useEffect(() => {
    if (user) load().catch((e) => setError(e.message));
  }, [user]);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await api.createDeposit({
      type: fd.get("type"),
      bank_name: fd.get("bank_name"),
      principal: fd.get("principal"),
      interest_rate: fd.get("interest_rate"),
      start_date: new Date(String(fd.get("start_date"))).toISOString(),
      maturity_date: new Date(String(fd.get("maturity_date"))).toISOString(),
      compounding: "quarterly",
      alert_days_before: 14,
    });
    setShowForm(false);
    await load();
  }

  if (loading || !user) return <div className="min-h-screen grid place-items-center text-[var(--muted)]">Loading…</div>;

  const book = items.reduce((s, d) => s + (Number(d.principal) || 0), 0);

  return (
    <AppShell
      userName={user.name}
      title="Deposit book"
      subtitle="FD & RD ladder with maturity radar — bank treasury style."
      actions={<button className="btn-primary" onClick={() => setShowForm((v) => !v)}>{showForm ? "Cancel" : "Add deposit"}</button>}
    >
      <div className="kpi mb-6 max-w-xs">
        <div className="text-xs uppercase tracking-wider text-[var(--muted)]">Active principal</div>
        <div className="text-2xl mt-1 tabular-nums" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>{formatINR(book)}</div>
      </div>
      {error && <p className="text-[var(--danger)] text-sm mb-4">{error}</p>}
      {showForm && (
        <form onSubmit={onCreate} className="panel p-5 mb-6 grid gap-3 sm:grid-cols-3">
          <label><span className="label">Type</span><select className="field" name="type"><option value="FD">FD</option><option value="RD">RD</option></select></label>
          <label><span className="label">Bank</span><input className="field" name="bank_name" required /></label>
          <label><span className="label">Principal ₹</span><input className="field" name="principal" type="number" step="0.01" required /></label>
          <label><span className="label">Interest %</span><input className="field" name="interest_rate" type="number" step="0.01" required /></label>
          <label><span className="label">Start</span><input className="field" name="start_date" type="date" required /></label>
          <label><span className="label">Maturity</span><input className="field" name="maturity_date" type="date" required /></label>
          <div className="sm:col-span-3"><button className="btn-primary" type="submit">Save deposit</button></div>
        </form>
      )}
      <div className="panel overflow-x-auto">
        <table className="table-pro">
          <thead><tr><th>Type</th><th>Bank</th><th>Principal</th><th>Rate</th><th>Matures</th><th>Status</th></tr></thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={6} className="text-[var(--muted)]">No deposits yet.</td></tr>
            ) : items.map((d) => (
              <tr key={d.id}>
                <td className="font-semibold">{d.type}</td>
                <td>{d.bank_name}</td>
                <td className="tabular-nums font-semibold">{formatINR(d.principal)}</td>
                <td className="tabular-nums">{d.interest_rate}%</td>
                <td>{new Date(d.maturity_date).toLocaleDateString("en-IN")}</td>
                <td className="capitalize text-[var(--accent)]">{d.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
