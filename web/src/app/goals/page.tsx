"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api, Goal } from "@/lib/api";
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

export default function GoalsPage() {
  const { user, loading } = useSession();
  const [items, setItems] = useState<Goal[]>([]);
  const [selected, setSelected] = useState("home");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setItems((await api.goals()) || []);
  }

  useEffect(() => {
    if (user) load().catch((e) => setError(e.message));
  }, [user]);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await api.createGoal({
      name: fd.get("name"),
      goal_type: fd.get("goal_type") || selected,
      target_amount: fd.get("target_amount"),
      current_amount: fd.get("current_amount") || "0",
      monthly_contribution: fd.get("monthly_contribution") || "0",
      priority: Number(fd.get("priority") || 2),
      target_date: fd.get("target_date") ? new Date(String(fd.get("target_date"))).toISOString() : null,
      category: fd.get("goal_type") || selected,
    });
    e.currentTarget.reset();
    await load();
  }

  if (loading || !user) return <div className="min-h-screen grid place-items-center text-[var(--muted)]">Loading…</div>;

  return (
    <AppShell
      userName={user.name}
      title="Goal missions"
      subtitle="Bank-style goal desks — target corpus, funding %, and monthly contribution."
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
        <label className="sm:col-span-2"><span className="label">Mission name</span><input className="field" name="name" required placeholder={`${TEMPLATES.find((t) => t.type === selected)?.label} goal`} /></label>
        <label><span className="label">Priority (1 high)</span><input className="field" name="priority" type="number" min={1} max={5} defaultValue={2} /></label>
        <label><span className="label">Target corpus ₹</span><input className="field" name="target_amount" type="number" required /></label>
        <label><span className="label">Already funded ₹</span><input className="field" name="current_amount" type="number" defaultValue={0} /></label>
        <label><span className="label">Monthly contribution ₹</span><input className="field" name="monthly_contribution" type="number" defaultValue={0} /></label>
        <label><span className="label">Target date</span><input className="field" name="target_date" type="date" /></label>
        <div className="sm:col-span-2 flex items-end"><button className="btn-primary" type="submit">Create goal mission</button></div>
      </form>

      <div className="grid gap-4 md:grid-cols-2">
        {items.length === 0 && <p className="text-[var(--muted)]">No goals yet — pick a template above.</p>}
        {items.map((g) => {
          const pct = Math.min(100, (Number(g.current_amount) / Math.max(1, Number(g.target_amount))) * 100);
          const gap = Math.max(0, Number(g.target_amount) - Number(g.current_amount));
          return (
            <article key={g.id} className="panel p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-[var(--brand)] font-semibold">{g.goal_type || g.category || "custom"}</div>
                  <h3 className="text-xl mt-1" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>{g.name}</h3>
                </div>
                <div className="text-right">
                  <div className="text-2xl tabular-nums font-semibold" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>{pct.toFixed(0)}%</div>
                  <div className="text-xs text-[var(--muted)]">funded</div>
                  <button
                    type="button"
                    className="btn-ghost text-xs py-1 px-2 mt-2 text-[var(--danger)] border-[rgba(180,35,24,0.35)]"
                    onClick={async () => {
                      if (!confirm("Delete this goal?")) return;
                      await api.deleteGoal(g.id);
                      await load();
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
              <div className="mt-4 h-2.5 rounded-full bg-[var(--chip)] overflow-hidden">
                <div className="h-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <div><div className="text-[var(--muted)] text-xs">Target</div><div className="font-semibold tabular-nums">{formatINR(g.target_amount)}</div></div>
                <div><div className="text-[var(--muted)] text-xs">Saved</div><div className="font-semibold tabular-nums">{formatINR(g.current_amount)}</div></div>
                <div><div className="text-[var(--muted)] text-xs">Gap</div><div className="font-semibold tabular-nums">{formatINR(gap)}</div></div>
              </div>
              <div className="mt-3 text-sm text-[var(--muted)]">
                Monthly plan: {formatINR(g.monthly_contribution || 0)}
                {g.target_date ? ` · Due ${new Date(g.target_date).toLocaleDateString("en-IN")}` : ""}
              </div>
            </article>
          );
        })}
      </div>
    </AppShell>
  );
}
