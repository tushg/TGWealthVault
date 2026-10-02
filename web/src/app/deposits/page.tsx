"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api, Deposit, Goal, GoalAsset } from "@/lib/api";
import { formatINR } from "@/lib/format";
import { useSession } from "@/lib/useSession";

type Filter = "active" | "matured" | "all";

export default function DepositsPage() {
  const { user, loading } = useSession();
  const [items, setItems] = useState<Deposit[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [links, setLinks] = useState<GoalAsset[]>([]);
  const [filter, setFilter] = useState<Filter>("active");
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load(nextFilter: Filter = filter) {
    const status = nextFilter === "all" ? undefined : nextFilter;
    const [deposits, g, assets] = await Promise.all([
      api.deposits(status),
      api.goals(),
      api.goalAssets(),
    ]);
    setItems(deposits || []);
    setGoals(g || []);
    setLinks(assets || []);
  }

  useEffect(() => {
    if (user) load(filter).catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, filter]);

  const goalByDeposit = useMemo(() => {
    const m: Record<string, GoalAsset | undefined> = {};
    for (const l of links) {
      if (l.asset_type !== "deposit") continue;
      // One investment → one goal; keep first if duplicates remain.
      if (!m[l.asset_id]) m[l.asset_id] = l;
    }
    return m;
  }, [links]);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const fdNumber = String(fd.get("fd_number") || "").trim();
    const maturityAmount = String(fd.get("maturity_amount") || "").trim();
    try {
      await api.createDeposit({
        type: fd.get("type"),
        bank_name: fd.get("bank_name"),
        fd_number: fdNumber || null,
        principal: fd.get("principal"),
        interest_rate: fd.get("interest_rate"),
        start_date: new Date(String(fd.get("start_date"))).toISOString(),
        maturity_date: new Date(String(fd.get("maturity_date"))).toISOString(),
        maturity_amount: maturityAmount || null,
        compounding: "quarterly",
        alert_days_before: 14,
      });
      setShowForm(false);
      await load(filter);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this deposit permanently?")) return;
    setBusyId(id);
    try {
      await api.deleteDeposit(id);
      await load(filter);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  async function onMature(id: string) {
    if (!confirm("Mark this FD/RD as matured? It will move to history and leave portfolio assets.")) return;
    setBusyId(id);
    try {
      await api.matureDeposit(id);
      await load(filter);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  async function tagGoal(depositId: string, goalId: string) {
    if (!goalId) return;
    setError(null);
    try {
      await api.linkGoalAsset(goalId, { asset_type: "deposit", asset_id: depositId });
      await load(filter);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not tag goal");
    }
  }

  async function untagGoal(goalId: string, depositId: string) {
    setError(null);
    try {
      await api.unlinkGoalAsset(goalId, "deposit", depositId);
      await load(filter);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove tag");
    }
  }

  const activePrincipal = useMemo(
    () => items.filter((d) => d.status === "active").reduce((s, d) => s + (Number(d.principal) || 0), 0),
    [items],
  );
  const activeMaturity = useMemo(
    () => items.filter((d) => d.status === "active").reduce((s, d) => s + (Number(d.maturity_amount) || 0), 0),
    [items],
  );

  if (loading || !user) return <div className="min-h-screen grid place-items-center text-[var(--muted)]">Loading…</div>;

  return (
    <AppShell
      userName={user.name}
      title="Deposit book"
      subtitle="Active FDs count toward assets. Matured deposits are history only."
      actions={<button className="btn-primary" onClick={() => setShowForm((v) => !v)}>{showForm ? "Cancel" : "Add deposit"}</button>}
    >
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="inline-flex rounded-xl border border-[var(--line)] bg-white p-1">
          {([
            ["active", "Active"],
            ["matured", "Matured"],
            ["all", "All"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
                filter === key ? "bg-[var(--brand)] text-white" : "text-[var(--muted)] hover:text-[var(--ink)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {filter !== "matured" && (
          <div className="flex flex-wrap gap-3">
            <div className="kpi">
              <div className="text-xs uppercase tracking-wider text-[var(--muted)]">Active principal</div>
              <div className="text-xl mt-1 tabular-nums" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>{formatINR(activePrincipal)}</div>
            </div>
            <div className="kpi">
              <div className="text-xs uppercase tracking-wider text-[var(--muted)]">Active maturity value</div>
              <div className="text-xl mt-1 tabular-nums" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>{formatINR(activeMaturity)}</div>
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-[var(--danger)] text-sm mb-4">{error}</p>}

      {showForm && (
        <form onSubmit={onCreate} className="panel p-5 mb-6 grid gap-3 sm:grid-cols-3">
          <label><span className="label">Type</span><select className="field" name="type"><option value="FD">FD</option><option value="RD">RD</option></select></label>
          <label><span className="label">Bank</span><input className="field" name="bank_name" required /></label>
          <label><span className="label">FD / RD number (optional)</span><input className="field" name="fd_number" placeholder="Account / receipt no." /></label>
          <label><span className="label">Principal ₹</span><input className="field" name="principal" type="number" step="0.01" required /></label>
          <label><span className="label">Interest %</span><input className="field" name="interest_rate" type="number" step="0.01" required /></label>
          <label><span className="label">Maturity amount ₹</span><input className="field" name="maturity_amount" type="number" step="0.01" placeholder="Expected on maturity" /></label>
          <label><span className="label">Start</span><input className="field" name="start_date" type="date" required /></label>
          <label><span className="label">Maturity date</span><input className="field" name="maturity_date" type="date" required /></label>
          <div className="sm:col-span-3"><button className="btn-primary" type="submit">Save deposit</button></div>
        </form>
      )}

      <div className="panel overflow-x-auto">
        <table className="table-pro">
          <thead>
            <tr>
              <th>Type</th>
              <th>Bank / No.</th>
              <th>Principal</th>
              <th>Maturity amt</th>
              <th>Rate</th>
              <th>Matures</th>
              <th>Status</th>
              <th>Tagged goal</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={9} className="text-[var(--muted)]">No {filter === "all" ? "" : filter + " "}deposits.</td></tr>
            ) : items.map((d) => {
              const tagged = goalByDeposit[d.id];
              return (
                <tr key={d.id} className={d.status === "matured" ? "opacity-75" : undefined}>
                  <td className="font-semibold">{d.type}</td>
                  <td>
                    <div>{d.bank_name}</div>
                    <div className="text-xs text-[var(--muted)]">{d.fd_number || "No FD number"}</div>
                  </td>
                  <td className="tabular-nums font-semibold">{formatINR(d.principal)}</td>
                  <td className="tabular-nums">{d.maturity_amount ? formatINR(d.maturity_amount) : "—"}</td>
                  <td className="tabular-nums">{d.interest_rate}%</td>
                  <td>{new Date(d.maturity_date).toLocaleDateString("en-IN")}</td>
                  <td className={`capitalize font-medium ${d.status === "active" ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}>{d.status}</td>
                  <td>
                    <div className="space-y-1.5 min-w-[160px]">
                      {tagged ? (
                        <div className="flex items-center gap-2 text-sm">
                          <span>{tagged.goal_name}</span>
                          <button
                            type="button"
                            className="text-xs text-[var(--danger)]"
                            onClick={() => untagGoal(tagged.goal_id, d.id)}
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <select
                          className="field text-sm py-1.5"
                          defaultValue=""
                          onChange={(e) => {
                            tagGoal(d.id, e.target.value);
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
                    <div className="flex flex-wrap gap-2">
                      {d.status === "active" && (
                        <button
                          type="button"
                          className="btn-ghost text-xs py-1.5 px-2.5"
                          disabled={busyId === d.id}
                          onClick={() => onMature(d.id)}
                        >
                          Mark matured
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-ghost text-xs py-1.5 px-2.5 text-[var(--danger)] border-[rgba(180,35,24,0.35)]"
                        disabled={busyId === d.id}
                        onClick={() => onDelete(d.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
