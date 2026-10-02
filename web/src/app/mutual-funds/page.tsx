"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { api, MFHolding, MFTransaction } from "@/lib/api";
import { formatINR } from "@/lib/format";
import { useSession } from "@/lib/useSession";

export default function MutualFundsPage() {
  const { user, loading } = useSession();
  const [items, setItems] = useState<MFHolding[]>([]);
  const [txns, setTxns] = useState<MFTransaction[]>([]);
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedHolding, setSelectedHolding] = useState<string | null>(null);

  async function load() {
    const [holdings, transactions] = await Promise.all([api.mf(), api.mfTransactions()]);
    setItems(holdings || []);
    setTxns(transactions || []);
  }

  useEffect(() => {
    if (user) load().catch((e) => setError(e.message));
  }, [user]);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await api.createMF({
      scheme_name: fd.get("scheme_name"),
      amc: fd.get("amc") || null,
      units: fd.get("units"),
      nav: fd.get("nav") || null,
      invested_amount: fd.get("invested_amount") || null,
      current_value: fd.get("current_value") || null,
      category: fd.get("category") || "Equity",
      folio: fd.get("folio") || null,
    });
    setShow(false);
    await load();
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this mutual fund holding and its transactions?")) return;
    setBusyId(id);
    try {
      await api.deleteMF(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  const total = items.reduce((s, h) => s + (Number(h.current_value) || 0), 0);
  const visibleTxns = useMemo(
    () => (selectedHolding ? txns.filter((t) => t.holding_id === selectedHolding) : txns).slice(0, 100),
    [txns, selectedHolding],
  );

  if (loading || !user) return <div className="min-h-screen grid place-items-center text-[var(--muted)]">Loading…</div>;

  return (
    <AppShell
      userName={user.name}
      title="Mutual Funds"
      subtitle="Holdings from CAMS detailed CAS + transaction ledger."
      actions={
        <div className="flex gap-2">
          <Link href="/import" className="btn-ghost">Import CAS</Link>
          <button className="btn-primary" onClick={() => setShow((v) => !v)}>{show ? "Cancel" : "Add scheme"}</button>
        </div>
      }
    >
      <div className="grid sm:grid-cols-3 gap-3 mb-6">
        <div className="kpi"><div className="text-xs uppercase tracking-wider text-[var(--muted)]">Market value</div><div className="text-2xl mt-1 tabular-nums" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>{formatINR(total)}</div></div>
        <div className="kpi"><div className="text-xs uppercase tracking-wider text-[var(--muted)]">Schemes</div><div className="text-2xl mt-1 tabular-nums" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>{items.length}</div></div>
        <div className="kpi"><div className="text-xs uppercase tracking-wider text-[var(--muted)]">Transactions</div><div className="text-2xl mt-1 tabular-nums" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>{txns.length}</div></div>
      </div>

      {error && <p className="text-[var(--danger)] text-sm mb-4">{error}</p>}

      {show && (
        <form onSubmit={onCreate} className="panel p-5 mb-6 grid gap-3 sm:grid-cols-3">
          <label><span className="label">Scheme</span><input className="field" name="scheme_name" required /></label>
          <label><span className="label">AMC</span><input className="field" name="amc" /></label>
          <label><span className="label">Category</span>
            <select className="field" name="category"><option>Equity</option><option>Debt</option><option>Hybrid</option><option>Other</option></select>
          </label>
          <label><span className="label">Units</span><input className="field" name="units" type="number" step="0.0001" required /></label>
          <label><span className="label">NAV</span><input className="field" name="nav" type="number" step="0.0001" /></label>
          <label><span className="label">Current value</span><input className="field" name="current_value" type="number" step="0.01" /></label>
          <label><span className="label">Invested</span><input className="field" name="invested_amount" type="number" step="0.01" /></label>
          <label><span className="label">Folio</span><input className="field" name="folio" /></label>
          <div className="flex items-end"><button className="btn-primary w-full" type="submit">Save holding</button></div>
        </form>
      )}

      <div className="panel overflow-x-auto mb-6">
        <table className="table-pro">
          <thead>
            <tr>
              <th>Scheme</th>
              <th>Category</th>
              <th>Units</th>
              <th>NAV</th>
              <th>Value</th>
              <th>Weight</th>
              <th>Source</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={8} className="text-[var(--muted)]">No schemes yet. Import a CAMS detailed CAS.</td></tr>
            ) : items.map((h) => {
              const val = Number(h.current_value) || 0;
              const weight = total > 0 ? ((val / total) * 100).toFixed(1) : "0.0";
              return (
                <tr key={h.id} className={selectedHolding === h.id ? "bg-[var(--brand-soft)]" : undefined}>
                  <td>
                    <button type="button" className="text-left" onClick={() => setSelectedHolding(h.id === selectedHolding ? null : h.id)}>
                      <div className="font-medium">{h.scheme_name}</div>
                      <div className="text-xs text-[var(--muted)]">{h.amc || "—"}</div>
                    </button>
                  </td>
                  <td>{h.category || "—"}</td>
                  <td className="tabular-nums">{Number(h.units).toLocaleString("en-IN", { maximumFractionDigits: 4 })}</td>
                  <td className="tabular-nums">{h.nav ? Number(h.nav).toFixed(4) : "—"}</td>
                  <td className="tabular-nums font-semibold">{formatINR(h.current_value)}</td>
                  <td className="tabular-nums">{weight}%</td>
                  <td className="uppercase text-xs tracking-wide text-[var(--muted)]">{h.source}</td>
                  <td>
                    <button type="button" className="btn-ghost text-xs py-1.5 px-2.5 text-[var(--danger)] border-[rgba(180,35,24,0.35)]" disabled={busyId === h.id} onClick={() => onDelete(h.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="panel overflow-x-auto">
        <div className="px-5 py-4 border-b border-[var(--line)] flex items-center justify-between">
          <h2 className="text-lg" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>
            Transactions {selectedHolding ? "(filtered)" : ""}
          </h2>
          {selectedHolding && (
            <button type="button" className="text-sm font-semibold text-[var(--brand)]" onClick={() => setSelectedHolding(null)}>Clear filter</button>
          )}
        </div>
        <table className="table-pro">
          <thead>
            <tr>
              <th>Date</th>
              <th>Scheme</th>
              <th>Type</th>
              <th>Description</th>
              <th>Amount</th>
              <th>Units</th>
              <th>NAV</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {visibleTxns.length === 0 ? (
              <tr><td colSpan={8} className="text-[var(--muted)]">No transactions yet — import a CAMS detailed statement.</td></tr>
            ) : visibleTxns.map((t) => (
              <tr key={t.id}>
                <td>{new Date(t.txn_date).toLocaleDateString("en-IN")}</td>
                <td className="max-w-[220px] truncate">{t.scheme_name}</td>
                <td className="capitalize text-xs">{t.txn_type.replaceAll("_", " ")}</td>
                <td className="max-w-[220px] truncate text-[var(--muted)]">{t.description || "—"}</td>
                <td className="tabular-nums">{formatINR(t.amount)}</td>
                <td className="tabular-nums">{t.units ? Number(t.units).toLocaleString("en-IN", { maximumFractionDigits: 4 }) : "—"}</td>
                <td className="tabular-nums">{t.nav ? Number(t.nav).toFixed(4) : "—"}</td>
                <td className="tabular-nums">{t.balance_units ? Number(t.balance_units).toLocaleString("en-IN", { maximumFractionDigits: 4 }) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
