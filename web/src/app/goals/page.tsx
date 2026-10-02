"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api, Deposit, Goal, GoalAsset, MFHolding } from "@/lib/api";
import { formatINR } from "@/lib/format";
import { useSession } from "@/lib/useSession";

const TEMPLATES = [
  { type: "home", label: "Home", blurb: "Down payment / home corpus", emoji: "H" },
  { type: "education", label: "Education", blurb: "Child higher education", emoji: "E" },
  { type: "retirement", label: "Retirement", blurb: "Corpus at retirement age", emoji: "R" },
  { type: "emergency", label: "Emergency", blurb: "6–12 months expenses", emoji: "!" },
  { type: "wedding", label: "Wedding", blurb: "Family wedding corpus", emoji: "W" },
  { type: "vehicle", label: "Vehicle", blurb: "Car / two-wheeler fund", emoji: "V" },
];

const TARGET_MIN = 50_000;
const TARGET_MAX = 5_00_00_000; // 5 Cr
const TARGET_STEP = 25_000;

function clampTarget(n: number) {
  if (!Number.isFinite(n) || n < TARGET_MIN) return TARGET_MIN;
  if (n > TARGET_MAX) return TARGET_MAX;
  return Math.round(n / TARGET_STEP) * TARGET_STEP;
}

function TargetSlider({
  value,
  onChange,
  id,
}: {
  value: number;
  onChange: (v: number) => void;
  id?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold tabular-nums" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>
          {formatINR(value)}
        </span>
        <input
          className="field w-36 text-right"
          type="number"
          min={TARGET_MIN}
          max={TARGET_MAX}
          step={TARGET_STEP}
          value={value}
          onChange={(e) => onChange(clampTarget(Number(e.target.value) || TARGET_MIN))}
        />
      </div>
      <input
        id={id}
        className="goal-slider w-full"
        type="range"
        min={TARGET_MIN}
        max={TARGET_MAX}
        step={TARGET_STEP}
        value={Math.min(TARGET_MAX, Math.max(TARGET_MIN, value))}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="flex justify-between text-[11px] text-[var(--muted)]">
        <span>{formatINR(TARGET_MIN)}</span>
        <span>{formatINR(TARGET_MAX)}</span>
      </div>
    </div>
  );
}

export default function GoalsPage() {
  const { user, loading } = useSession();
  const [items, setItems] = useState<Goal[]>([]);
  const [funds, setFunds] = useState<MFHolding[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [links, setLinks] = useState<GoalAsset[]>([]);
  const [selected, setSelected] = useState("home");
  const [error, setError] = useState<string | null>(null);
  const [createTarget, setCreateTarget] = useState(10_00_000);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState(10_00_000);
  const [editName, setEditName] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    const [goals, mf, deps, assets] = await Promise.all([
      api.goals(),
      api.mf(),
      api.deposits("active"),
      api.goalAssets(),
    ]);
    setItems(goals || []);
    setFunds(mf || []);
    setDeposits(deps || []);
    setLinks(assets || []);
  }

  useEffect(() => {
    if (user) load().catch((e) => setError(e.message));
  }, [user]);

  const linksByGoal = useMemo(() => {
    const m: Record<string, GoalAsset[]> = {};
    for (const l of links) {
      (m[l.goal_id] ||= []).push(l);
    }
    return m;
  }, [links]);

  /** Investments already linked to any goal (one goal per investment). */
  const linkedAssetKeys = useMemo(
    () => new Set(links.map((l) => `${l.asset_type}:${l.asset_id}`)),
    [links]
  );

  function assetTypeLabel(type: string) {
    if (type === "mf") return "Mutual Fund";
    if (type === "deposit") return "Deposit";
    return type.toUpperCase();
  }

  function depositLabel(d: Deposit) {
    const kind = (d.type || "deposit").toUpperCase();
    const num = d.fd_number ? ` #${d.fd_number}` : "";
    return `${kind} · ${d.bank_name}${num}`;
  }

  function depositValue(d: Deposit) {
    return d.maturity_amount || d.principal;
  }

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const dateRaw = String(fd.get("target_date") || "").trim();
    try {
      await api.createGoal({
        name: String(fd.get("name") || "").trim(),
        goal_type: String(fd.get("goal_type") || selected),
        target_amount: String(createTarget),
        current_amount: String(fd.get("current_amount") || "0").trim() || "0",
        monthly_contribution: String(fd.get("monthly_contribution") || "0").trim() || "0",
        priority: Number(fd.get("priority") || 2),
        target_date: dateRaw || null,
        category: String(fd.get("goal_type") || selected),
      });
      e.currentTarget.reset();
      setCreateTarget(10_00_000);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create goal");
    }
  }

  function startEdit(g: Goal) {
    setEditingId(g.id);
    setEditName(g.name);
    setEditTarget(clampTarget(Number(g.target_amount) || TARGET_MIN));
    setError(null);
  }

  async function saveEdit(goalId: string) {
    setSavingId(goalId);
    setError(null);
    try {
      await api.updateGoal(goalId, {
        name: editName.trim(),
        target_amount: String(editTarget),
      });
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update goal");
    } finally {
      setSavingId(null);
    }
  }

  async function attach(goalId: string, raw: string) {
    if (!raw) return;
    const [assetType, assetId] = raw.split(":");
    if (!assetType || !assetId) return;
    setError(null);
    try {
      await api.linkGoalAsset(goalId, { asset_type: assetType, asset_id: assetId });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not attach investment");
    }
  }

  async function detach(goalId: string, assetType: string, assetId: string) {
    setError(null);
    try {
      await api.unlinkGoalAsset(goalId, assetType, assetId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove investment");
    }
  }

  if (loading || !user) return <div className="min-h-screen grid place-items-center text-[var(--muted)]">Loading…</div>;

  return (
    <AppShell
      userName={user.name}
      title="Goal missions"
      subtitle="Attach FD, RD, or mutual funds to a goal. Linked value updates goal funding."
    >
      {error && <p className="text-[var(--danger)] text-sm mb-4">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6 mb-6">
        {TEMPLATES.map((t) => (
          <button
            key={t.type}
            type="button"
            onClick={() => setSelected(t.type)}
            className={`text-left rounded-xl border p-3 transition ${selected === t.type ? "border-[var(--brand)] bg-[var(--brand-soft)]" : "border-[var(--line)] bg-white"}`}
          >
            <div className="h-8 w-8 rounded-lg bg-[var(--brand-deep)] text-white grid place-items-center text-sm font-bold">{t.emoji}</div>
            <div className="mt-2 font-semibold text-sm">{t.label}</div>
            <div className="text-xs text-[var(--muted)] mt-0.5">{t.blurb}</div>
          </button>
        ))}
      </div>

      <form onSubmit={onCreate} className="panel p-5 mb-6 grid gap-3 sm:grid-cols-3">
        <input type="hidden" name="goal_type" value={selected} />
        <label className="sm:col-span-2">
          <span className="label">Mission name</span>
          <input className="field" name="name" required placeholder={`${TEMPLATES.find((t) => t.type === selected)?.label} goal`} />
        </label>
        <label>
          <span className="label">Priority (1 high)</span>
          <input className="field" name="priority" type="number" min={1} max={5} defaultValue={2} />
        </label>
        <div className="sm:col-span-3">
          <span className="label">Target corpus ₹</span>
          <TargetSlider value={createTarget} onChange={setCreateTarget} />
        </div>
        <label>
          <span className="label">Already funded ₹</span>
          <input className="field" name="current_amount" type="number" defaultValue={0} />
        </label>
        <label>
          <span className="label">Monthly contribution ₹</span>
          <input className="field" name="monthly_contribution" type="number" defaultValue={0} />
        </label>
        <label>
          <span className="label">Target date</span>
          <input className="field" name="target_date" type="date" />
        </label>
        <div className="sm:col-span-3 flex items-end">
          <button className="btn-primary" type="submit">
            Create goal mission
          </button>
        </div>
      </form>

      <div className="grid gap-4 md:grid-cols-2">
        {items.length === 0 && <p className="text-[var(--muted)]">No goals yet — pick a template above.</p>}
        {items.map((g) => {
          const isEditing = editingId === g.id;
          const displayTarget = isEditing ? editTarget : Number(g.target_amount) || 0;
          const pct = Math.min(100, (Number(g.current_amount) / Math.max(1, displayTarget)) * 100);
          const gap = Math.max(0, displayTarget - Number(g.current_amount));
          const attached = linksByGoal[g.id] || [];
          return (
            <article key={g.id} className="panel p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] uppercase tracking-wider text-[var(--brand)] font-semibold">
                    {g.goal_type || g.category || "custom"}
                  </div>
                  {isEditing ? (
                    <input
                      className="field mt-2"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Goal name"
                    />
                  ) : (
                    <h3 className="text-xl mt-1" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>
                      {g.name}
                    </h3>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-2xl tabular-nums font-semibold" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>
                    {pct.toFixed(0)}%
                  </div>
                  <div className="text-xs text-[var(--muted)]">funded</div>
                  <div className="flex flex-col items-end gap-1.5 mt-2">
                    {!isEditing ? (
                      <button type="button" className="btn-ghost text-xs py-1 px-2" onClick={() => startEdit(g)}>
                        Edit target
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn-ghost text-xs py-1 px-2 text-[var(--danger)] border-[rgba(180,35,24,0.35)]"
                      onClick={async () => {
                        if (!confirm("Delete this goal?")) return;
                        await api.deleteGoal(g.id);
                        if (editingId === g.id) setEditingId(null);
                        await load();
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-4 h-2.5 rounded-full bg-[var(--chip)] overflow-hidden">
                <div className="h-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
              </div>

              {isEditing ? (
                <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--bg-soft)] p-4 space-y-3">
                  <div className="text-xs uppercase tracking-wider text-[var(--muted)]">Edit target corpus</div>
                  <TargetSlider value={editTarget} onChange={setEditTarget} id={`target-${g.id}`} />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-primary text-sm"
                      disabled={savingId === g.id || !editName.trim()}
                      onClick={() => saveEdit(g.id)}
                    >
                      {savingId === g.id ? "Saving…" : "Save changes"}
                    </button>
                    <button type="button" className="btn-ghost text-sm" onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <div className="text-[var(--muted)] text-xs">Target</div>
                    <div className="font-semibold tabular-nums">{formatINR(g.target_amount)}</div>
                  </div>
                  <div>
                    <div className="text-[var(--muted)] text-xs">Saved</div>
                    <div className="font-semibold tabular-nums">{formatINR(g.current_amount)}</div>
                  </div>
                  <div>
                    <div className="text-[var(--muted)] text-xs">Gap</div>
                    <div className="font-semibold tabular-nums">{formatINR(gap)}</div>
                  </div>
                </div>
              )}

              <div className="mt-5 border-t border-[var(--line)] pt-4">
                <div className="text-xs uppercase tracking-wider text-[var(--muted)] mb-2">Linked investments</div>
                <div className="space-y-2 mb-3">
                  {attached.length === 0 && <p className="text-sm text-[var(--muted)]">No investments linked yet.</p>}
                  {attached.map((a) => (
                    <div
                      key={`${a.asset_type}-${a.asset_id}`}
                      className="flex items-center justify-between gap-2 text-sm rounded-lg bg-[var(--bg-soft)] px-3 py-2"
                    >
                      <div>
                        <div className="font-medium">{a.asset_name}</div>
                        <div className="text-xs text-[var(--muted)]">
                          {assetTypeLabel(a.asset_type)} · {formatINR(a.asset_value || a.allocated_amount)}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="text-xs font-semibold text-[var(--danger)]"
                        onClick={() => detach(g.id, a.asset_type, a.asset_id)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                {(() => {
                  const availableMF = funds.filter((f) => !linkedAssetKeys.has(`mf:${f.id}`));
                  const availableFD = deposits.filter((d) => (d.type || "").toLowerCase() === "fd" && !linkedAssetKeys.has(`deposit:${d.id}`));
                  const availableRD = deposits.filter((d) => (d.type || "").toLowerCase() === "rd" && !linkedAssetKeys.has(`deposit:${d.id}`));
                  const otherDeposits = deposits.filter((d) => {
                    const t = (d.type || "").toLowerCase();
                    return t !== "fd" && t !== "rd" && !linkedAssetKeys.has(`deposit:${d.id}`);
                  });
                  const hasOptions = availableMF.length + availableFD.length + availableRD.length + otherDeposits.length > 0;
                  return (
                    <select
                      className="field"
                      defaultValue=""
                      disabled={!hasOptions}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v) {
                          attach(g.id, v);
                          e.target.value = "";
                        }
                      }}
                    >
                      <option value="">{hasOptions ? "Attach investment…" : "No investments available"}</option>
                      {availableMF.length > 0 && (
                        <optgroup label="Mutual Funds">
                          {availableMF.map((f) => (
                            <option key={f.id} value={`mf:${f.id}`}>
                              {f.scheme_name} ({formatINR(f.current_value)})
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {availableFD.length > 0 && (
                        <optgroup label="Fixed Deposits (FD)">
                          {availableFD.map((d) => (
                            <option key={d.id} value={`deposit:${d.id}`}>
                              {depositLabel(d)} ({formatINR(depositValue(d))})
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {availableRD.length > 0 && (
                        <optgroup label="Recurring Deposits (RD)">
                          {availableRD.map((d) => (
                            <option key={d.id} value={`deposit:${d.id}`}>
                              {depositLabel(d)} ({formatINR(depositValue(d))})
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {otherDeposits.length > 0 && (
                        <optgroup label="Other deposits">
                          {otherDeposits.map((d) => (
                            <option key={d.id} value={`deposit:${d.id}`}>
                              {depositLabel(d)} ({formatINR(depositValue(d))})
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  );
                })()}
              </div>
            </article>
          );
        })}
      </div>
    </AppShell>
  );
}
