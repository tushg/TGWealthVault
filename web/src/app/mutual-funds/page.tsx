"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { api, Goal, GoalAsset, MFHolding, MFTransaction } from "@/lib/api";
import { formatINR } from "@/lib/format";
import { useSession } from "@/lib/useSession";

export default function MutualFundsPage() {
  const { user, loading } = useSession();
  const [items, setItems] = useState<MFHolding[]>([]);
  const [txns, setTxns] = useState<MFTransaction[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [links, setLinks] = useState<GoalAsset[]>([]);
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedHolding, setSelectedHolding] = useState<string | null>(null);

  async function load() {
    const [holdings, transactions, g, assets] = await Promise.all([
      api.mf(),
      api.mfTransactions(),
      api.goals(),
      api.goalAssets(),
    ]);
    setItems(holdings || []);
    setTxns(transactions || []);
    setGoals(g || []);
    setLinks(assets || []);
  }

  useEffect(() => {
    if (user) load().catch((e) => setError(e.message));
  }, [user]);

  const goalByMf = useMemo(() => {
    const m: Record<string, GoalAsset[]> = {};
    for (const l of links) {
      if (l.asset_type !== "mf") continue;
      (m[l.asset_id] ||= []).push(l);
    }
    return m;
  }, [links]);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await api.createMF({
      scheme_name: fd.get("scheme_name"),
      amc: fd.get("amc") || null,
      units: fd.get("units") || "1",
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
    if (!confirm("Delete this mutual fund entry?")) return;
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

  async function tagGoal(mfId: string, goalId: string) {
    if (!goalId) return;
    setError(null);
    try {
      await api.linkGoalAsset(goalId, { asset_type: "mf", asset_id: mfId });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not tag goal");
    }
  }

  const totalCost = items.reduce((s, h) => s + (Number(h.invested_amount) || 0), 0);
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
      subtitle="CAMS portfolio summary (cost & market) with goal tagging."
      actions={
        <div className="flex gap-2">
          <Link href="/import" className="btn-ghost">Import CAS</Link>
          <button className="btn-primary" onClick={() => setShow((v) => !v)}>{show ? "Cancel" : "Add fund"}</button>
        </div>
      }
    >
      <div className="grid sm:grid-cols-3 gap-3 mb-6">
        <div className="kpi"><div className="text-xs uppercase tracking-wider text-[var(--muted)]">Cost value</div><div className="text-2xl mt-1 tabular-nums" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>{formatINR(totalCost)}</div></div>
        <div className="kpi"><div className="text-xs uppercase tracking-wider text-[var(--muted)]">Market value</div><div className="text-2xl mt-1 tabular-nums" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>{formatINR(total)}</div></div>
        <div className="kpi"><div className="text-xs uppercase tracking-wider text-[var(--muted)]">Funds</div><div className="text-2xl mt-1 tabular-nums" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>{items.length}</div></div>
      </div>

      {error && <p className="text-[var(--danger)] text-sm mb-4">{error}</p>}

      {show && (
        <form onSubmit={onCreate} className="panel p-5 mb-6 grid gap-3 sm:grid-cols-3">
          <label className="sm:col-span-2"><span className="label">Mutual fund / AMC name</span><input className="field" name="scheme_name" required /></label>
          <label><span className="label">Category</span>
            <select className="field" name="category"><option>Equity</option><option>Debt</option><option>Hybrid</option><option>Other</option></select>
          </label>
          <label><span className="label">Cost value ₹</span><input className="field" name="invested_amount" type="number" step="0.01" /></label>
          <label><span className="label">Market value ₹</span><input className="field" name="current_value" type="number" step="0.01" /></label>
          <div className="flex items-end"><button className="btn-primary w-full" type="submit">Save</button></div>
        </form>
      )}

      <div className="panel overflow-x-auto mb-6">
        <table className="table-pro">
          <thead>
            <tr>
              <th>Mutual Fund</th>
              <th>Cost Value</th>
              <th>Market Value</th>
              <th>Gain</th>
              <th>Tagged goal</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={6} className="text-[var(--muted)]">No funds yet. Import Portfolio Summary from Import CAS.</td></tr>
            ) : items.map((h) => {
              const cost = Number(h.invested_amount) || 0;
              const mkt = Number(h.current_value) || 0;
              const gain = mkt - cost;
              const tagged = goalByMf[h.id] || [];
              return (
                <tr key={h.id}>
                  <td>
                    <button type="button" className="text-left font-medium" onClick={() => setSelectedHolding(h.id === selectedHolding ? null : h.id)}>
                      {h.scheme_name}
                    </button>
                    <div className="text-xs text-[var(--muted)] uppercase">{h.source}</div>
                  </td>
                  <td className="tabular-nums">{formatINR(cost)}</td>
                  <td className="tabular-nums font-semibold">{formatINR(mkt)}</td>
                  <td className={`tabular-nums ${gain >= 0 ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}>{formatINR(gain)}</td>
                  <td>
                    <div className="space-y-1.5 min-w-[160px]">
                      {tagged.slice(0, 1).map((t) => (
                        <div key={t.goal_id} className="flex items-center gap-2 text-sm">
                          <span>{t.goal_name}</span>
                          <button type="button" className="text-xs text-[var(--danger)]" onClick={() => api.unlinkGoalAsset(t.goal_id, "mf", h.id).then(load).catch((e) => setError(e instanceof Error ? e.message : "Unlink failed"))}>×</button>
                        </div>
                      ))}
                      {tagged.length === 0 && (
                        <select
                          className="field text-sm py-1.5"
                          defaultValue=""
                          onChange={(e) => {
                            tagGoal(h.id, e.target.value);
                            e.target.value = "";
                          }}
                        >
                          <option value="">Tag to goal…</option>
                          {goals.map((g) => (
                            <option key={g.id} value={g.id}>{g.name}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </td>
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

      {txns.length > 0 && (
        <div className="panel overflow-x-auto">
          <div className="px-5 py-4 border-b border-[var(--line)]">
            <h2 className="text-lg" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>Transactions</h2>
          </div>
          <table className="table-pro">
            <thead>
              <tr>
                <th>Date</th>
                <th>Scheme</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Units</th>
                <th>NAV</th>
              </tr>
            </thead>
            <tbody>
              {visibleTxns.map((t) => (
                <tr key={t.id}>
                  <td>{new Date(t.txn_date).toLocaleDateString("en-IN")}</td>
                  <td className="max-w-[220px] truncate">{t.scheme_name}</td>
                  <td className="capitalize text-xs">{t.txn_type.replaceAll("_", " ")}</td>
                  <td className="tabular-nums">{formatINR(t.amount)}</td>
                  <td className="tabular-nums">{t.units ? Number(t.units).toLocaleString("en-IN", { maximumFractionDigits: 4 }) : "—"}</td>
                  <td className="tabular-nums">{t.nav ? Number(t.nav).toFixed(4) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
