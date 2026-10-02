"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { api, CashflowEntry, ExpenseReport } from "@/lib/api";
import { formatINR } from "@/lib/format";
import { useSession } from "@/lib/useSession";

const MIX_COLORS = ["#0a4d8c", "#0c7a54", "#9a6700", "#c45c26", "#5b6b7c", "#2a6f97", "#8b5e3c"];
const LINE_COLORS = ["#0a4d8c", "#c45c26", "#0c7a54", "#9a6700", "#5b6b7c", "#2a6f97", "#8b5e3c", "#6b3fa0"];

function ymNow(offsetMonths = 0) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offsetMonths);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function yearNow(offset = 0) {
  return String(new Date().getFullYear() + offset);
}

function utilizationPct(actual: number, budget: number) {
  if (budget <= 0) return actual > 0 ? 100 : 0;
  return Math.min(160, (actual / budget) * 100);
}

function statusTone(actual: number, budget: number) {
  if (budget <= 0 && actual > 0) return "over";
  if (actual > budget) return "over";
  if (budget > 0 && actual / budget >= 0.85) return "warn";
  return "ok";
}

export default function ExpenseReportPage() {
  const { user, loading } = useSession();
  const [period, setPeriod] = useState<"monthly" | "yearly">("monthly");
  const [from, setFrom] = useState(ymNow(-5));
  const [to, setTo] = useState(ymNow(0));
  const [report, setReport] = useState<ExpenseReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viz, setViz] = useState<"growth" | "trend" | "bars" | "mix" | "deviation" | "detail">("growth");
  const [focusExpense, setFocusExpense] = useState<string>("");
  const [seeding, setSeeding] = useState(false);
  const [detailMonth, setDetailMonth] = useState(ymNow(0));
  const [monthEntries, setMonthEntries] = useState<CashflowEntry[]>([]);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    // When switching granularity, normalize bounds
    if (period === "yearly") {
      setFrom((f) => (f.length >= 4 ? f.slice(0, 4) : yearNow(-1)));
      setTo((t) => (t.length >= 4 ? t.slice(0, 4) : yearNow(0)));
    } else {
      setFrom((f) => (f.length === 4 ? `${f}-01` : f.length >= 7 ? f.slice(0, 7) : ymNow(-5)));
      setTo((t) => (t.length === 4 ? `${t}-12` : t.length >= 7 ? t.slice(0, 7) : ymNow(0)));
    }
  }, [period]);

  async function load() {
    setError(null);
    const r = await api.expenseReport({ period, from, to });
    setReport(r);
    if (!focusExpense && r.top_growing?.length) {
      setFocusExpense(r.top_growing[0].name);
    }
  }

  useEffect(() => {
    if (user) load().catch((e) => setError(e.message));
  }, [user, period, from, to]);

  useEffect(() => {
    if (period === "monthly" && to && /^\d{4}-\d{2}/.test(to)) {
      setDetailMonth(to.slice(0, 7));
    } else if (period === "monthly" && from && /^\d{4}-\d{2}/.test(from) && from === to) {
      setDetailMonth(from.slice(0, 7));
    }
  }, [from, to, period]);

  useEffect(() => {
    if (!user || viz !== "detail") return;
    setDetailError(null);
    api.cashflow({ type: "expense", month: detailMonth })
      .then((rows) => setMonthEntries(rows || []))
      .catch((e) => setDetailError(e.message));
  }, [user, viz, detailMonth]);

  async function loadDemoData() {
    setSeeding(true);
    setError(null);
    try {
      await api.seedExpenseDemoData();
      setPeriod("monthly");
      setFrom(ymNow(-11));
      setTo(ymNow(0));
      setViz("growth");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load demo data");
    } finally {
      setSeeding(false);
    }
  }

  const items = report?.items || [];
  const growth = report?.growth || [];
  const topGrowing = report?.top_growing || [];

  const health = useMemo(() => {
    if (!items.length) return { onTrack: 0, warn: 0, over: 0, score: 0 };
    let onTrack = 0;
    let warn = 0;
    let over = 0;
    for (const i of items) {
      const tone = statusTone(Number(i.actual_amount) || 0, Number(i.budget_amount) || 0);
      if (tone === "over") over++;
      else if (tone === "warn") warn++;
      else onTrack++;
    }
    return { onTrack, warn, over, score: Math.round((onTrack / items.length) * 100) };
  }, [items]);

  const mixData = useMemo(
    () =>
      items
        .map((i) => ({ name: i.name, value: Number(i.actual_amount) || 0 }))
        .filter((r) => r.value > 0)
        .sort((a, b) => b.value - a.value),
    [items],
  );

  const deviationData = useMemo(
    () =>
      [...items]
        .map((i) => ({
          name: i.name.length > 12 ? `${i.name.slice(0, 10)}…` : i.name,
          fullName: i.name,
          deviation: Number(i.deviation) || 0,
        }))
        .sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation))
        .slice(0, 8),
    [items],
  );

  const growthChart = useMemo(
    () =>
      [...growth]
        .sort((a, b) => (Number(b.absolute_growth) || 0) - (Number(a.absolute_growth) || 0))
        .slice(0, 8)
        .map((g) => ({
          name: g.name.length > 12 ? `${g.name.slice(0, 10)}…` : g.name,
          fullName: g.name,
          growth: Number(g.absolute_growth) || 0,
          pct: Number(g.growth_pct) || 0,
          direction: g.direction,
        })),
    [growth],
  );

  const trendChart = useMemo(() => {
    const buckets = report?.trend?.buckets || [];
    const series = report?.trend?.series || [];
    const selected = focusExpense
      ? series.filter((s) => s.name === focusExpense)
      : [...series]
          .sort((a, b) => {
            const ga = growth.find((g) => g.name === a.name);
            const gb = growth.find((g) => g.name === b.name);
            return (Number(gb?.absolute_growth) || 0) - (Number(ga?.absolute_growth) || 0);
          })
          .slice(0, 4);

    return buckets.map((bucket, idx) => {
      const row: Record<string, string | number> = { bucket };
      for (const s of selected) {
        row[s.name] = Number(s.points[idx] || 0);
      }
      row.Total = Number(report?.trend?.totals?.[idx] || 0);
      return row;
    });
  }, [report, focusExpense, growth]);

  const trendKeys = useMemo(() => {
    if (!trendChart.length) return [] as string[];
    return Object.keys(trendChart[0]).filter((k) => k !== "bucket" && k !== "Total");
  }, [trendChart]);

  const usedPct = useMemo(() => {
    const budget = Number(report?.total_budget) || 0;
    const actual = Number(report?.total_actual) || 0;
    if (budget <= 0) return actual > 0 ? 100 : 0;
    return Math.min(100, Math.round((actual / budget) * 100));
  }, [report]);

  function applyPreset(kind: "current" | "6m" | "12m" | "ytd" | "3y") {
    if (period === "yearly") {
      if (kind === "current") {
        setFrom(yearNow(0));
        setTo(yearNow(0));
      } else if (kind === "3y") {
        setFrom(yearNow(-2));
        setTo(yearNow(0));
      } else {
        setFrom(yearNow(-1));
        setTo(yearNow(0));
      }
      return;
    }
    if (kind === "current") {
      setFrom(ymNow(0));
      setTo(ymNow(0));
    } else if (kind === "6m") {
      setFrom(ymNow(-5));
      setTo(ymNow(0));
    } else if (kind === "12m") {
      setFrom(ymNow(-11));
      setTo(ymNow(0));
    } else if (kind === "ytd") {
      const y = new Date().getFullYear();
      setFrom(`${y}-01`);
      setTo(ymNow(0));
    } else {
      setFrom(ymNow(-35));
      setTo(ymNow(0));
    }
  }

  if (loading || !user) return <div className="min-h-screen grid place-items-center text-[var(--muted)]">Loading…</div>;

  return (
    <AppShell
      userName={user.name}
      title="Expense Report"
      subtitle="Pick a date range to compare budget vs actual, and see which expenses are growing."
      actions={
        <div className="flex gap-2">
          <button type="button" className="btn-primary" disabled={seeding} onClick={loadDemoData}>
            {seeding ? "Loading…" : "Load sample data"}
          </button>
          <Link href="/cashflow/budget" className="btn-ghost">Expense Budget</Link>
          <Link href="/cashflow" className="btn-ghost">Cashflow</Link>
        </div>
      }
    >
      <div className="panel p-4 mb-5 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <label>
            <span className="label">View by</span>
            <select
              className="field"
              value={period}
              onChange={(e) => setPeriod(e.target.value as "monthly" | "yearly")}
            >
              <option value="monthly">Monthly growth</option>
              <option value="yearly">Yearly growth</option>
            </select>
          </label>
          <label>
            <span className="label">From</span>
            {period === "monthly" ? (
              <input className="field" type="month" value={from} onChange={(e) => setFrom(e.target.value)} />
            ) : (
              <input
                className="field"
                type="number"
                min={2000}
                max={2100}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            )}
          </label>
          <label>
            <span className="label">To</span>
            {period === "monthly" ? (
              <input className="field" type="month" value={to} onChange={(e) => setTo(e.target.value)} />
            ) : (
              <input
                className="field"
                type="number"
                min={2000}
                max={2100}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            )}
          </label>
          <div className="flex flex-wrap gap-1.5 pb-0.5">
            {(period === "monthly"
              ? [
                  { id: "current" as const, label: "Current month" },
                  { id: "6m" as const, label: "Last 6 mo" },
                  { id: "12m" as const, label: "Last 12 mo" },
                  { id: "ytd" as const, label: "YTD" },
                ]
              : [
                  { id: "current" as const, label: "This year" },
                  { id: "12m" as const, label: "2 years" },
                  { id: "3y" as const, label: "3 years" },
                ]
            ).map((p) => (
              <button key={p.id} type="button" className="btn-ghost text-xs py-1.5 px-2.5" onClick={() => applyPreset(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        {report && (
          <p className="text-xs text-[var(--muted)]">
            Showing <span className="font-semibold text-[var(--ink)]">{report.label}</span>
            {" · "}
            {report.months_covered} month{report.months_covered === 1 ? "" : "s"} covered
            {" · "}
            growth compares first vs last {period === "yearly" ? "year" : "month"} with spend
          </p>
        )}
      </div>

      {error && <p className="text-[var(--danger)] text-sm mb-4">{error}</p>}

      {report && (
        <>
          <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr] mb-5">
            <div className="panel p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wider text-[var(--muted)]">Budget health</div>
                  <div className="mt-2 text-3xl tabular-nums" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>
                    {health.score}%
                    <span className="text-base text-[var(--muted)] font-normal ml-2">on track</span>
                  </div>
                </div>
                <div className="text-right text-sm">
                  <div className="text-[var(--accent)]">{health.onTrack} within</div>
                  <div className="text-[var(--warn)]">{health.warn} near limit</div>
                  <div className="text-[var(--danger)]">{health.over} over</div>
                </div>
              </div>
              <div className="mt-4 h-2.5 rounded-full bg-[var(--chip)] overflow-hidden">
                <div
                  className={`h-full ${Number(report.total_deviation) > 0 ? "bg-[var(--danger)]" : "bg-[var(--accent)]"}`}
                  style={{ width: `${usedPct}%` }}
                />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                <div>
                  <div className="text-xs text-[var(--muted)]">Budget</div>
                  <div className="font-semibold tabular-nums">{formatINR(report.total_budget)}</div>
                </div>
                <div>
                  <div className="text-xs text-[var(--muted)]">Spent</div>
                  <div className="font-semibold tabular-nums">{formatINR(report.total_actual)}</div>
                </div>
                <div>
                  <div className="text-xs text-[var(--muted)]">Gap</div>
                  <div className={`font-semibold tabular-nums ${Number(report.total_deviation) > 0 ? "text-[var(--danger)]" : "text-[var(--accent)]"}`}>
                    {formatINR(report.total_deviation)}
                  </div>
                </div>
              </div>
            </div>

            <div className="panel p-5">
              <div className="text-xs uppercase tracking-wider text-[var(--muted)] mb-3">
                Fastest growing · {period === "yearly" ? "year over year" : "month over month"}
              </div>
              {topGrowing.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">Add expenses across multiple months to detect growth.</p>
              ) : (
                <div className="space-y-2.5">
                  {topGrowing.slice(0, 4).map((g, idx) => {
                    const up = g.direction === "up";
                    const down = g.direction === "down";
                    return (
                      <button
                        key={g.budget_id}
                        type="button"
                        onClick={() => {
                          setFocusExpense(g.name);
                          setViz("trend");
                        }}
                        className="w-full text-left rounded-lg border border-[var(--line)] px-3 py-2 hover:bg-[var(--bg-soft)] transition"
                      >
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="font-medium">#{idx + 1} {g.name}</span>
                          <span className={`tabular-nums font-semibold ${up ? "text-[var(--danger)]" : down ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}>
                            {up ? "↑" : down ? "↓" : "→"} {formatINR(g.absolute_growth)} ({Number(g.growth_pct).toFixed(0)}%)
                          </span>
                        </div>
                        <div className="text-[11px] text-[var(--muted)] mt-0.5">
                          {formatINR(g.first_amount)} → {formatINR(g.last_amount)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="panel p-4 mb-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h2 className="text-lg" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>Visual insights</h2>
              <div className="inline-flex flex-wrap rounded-lg border border-[var(--line)] p-0.5 bg-[var(--bg-soft)]">
                {(
                  [
                    { id: "detail" as const, label: "Month expenses" },
                    { id: "growth" as const, label: "What's growing" },
                    { id: "trend" as const, label: "Trend lines" },
                    { id: "bars" as const, label: "Utilization" },
                    { id: "mix" as const, label: "Spend mix" },
                    { id: "deviation" as const, label: "Deviation" },
                  ]
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setViz(t.id)}
                    className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition ${
                      viz === t.id ? "bg-white text-[var(--ink)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--ink)]"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {items.length === 0 && viz !== "detail" ? (
              <p className="text-sm text-[var(--muted)] py-6 text-center">Add items in Expense Budget to unlock insights.</p>
            ) : viz === "detail" ? (
              <div>
                <div className="flex flex-wrap gap-3 items-end mb-4">
                  <label>
                    <span className="label">Month</span>
                    <input className="field" type="month" value={detailMonth} onChange={(e) => setDetailMonth(e.target.value)} />
                  </label>
                  <button type="button" className="btn-ghost text-xs py-1.5 px-2.5" onClick={() => setDetailMonth(ymNow(0))}>Current month</button>
                  <button type="button" className="btn-ghost text-xs py-1.5 px-2.5" onClick={() => setDetailMonth(ymNow(-1))}>Last month</button>
                  <Link href={`/cashflow`} className="btn-ghost text-xs py-1.5 px-2.5">Open in Cashflow</Link>
                </div>
                {detailError && <p className="text-sm text-[var(--danger)] mb-3">{detailError}</p>}
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-[var(--muted)]">
                    {new Date(`${detailMonth}-01`).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
                    {" · "}
                    {monthEntries.length} expense{monthEntries.length === 1 ? "" : "s"}
                  </span>
                  <span className="font-semibold tabular-nums">
                    Total {formatINR(monthEntries.reduce((s, e) => s + (Number(e.amount) || 0), 0))}
                  </span>
                </div>
                <div className="overflow-x-auto max-h-[320px] overflow-y-auto border border-[var(--line)] rounded-lg">
                  <table className="table-pro">
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th>Amount</th>
                        <th>Recurring</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthEntries.length === 0 ? (
                        <tr><td colSpan={3} className="text-[var(--muted)]">No expenses in this month.</td></tr>
                      ) : monthEntries.map((e) => (
                        <tr key={e.id}>
                          <td className="font-medium">{e.category}</td>
                          <td className="tabular-nums font-semibold">{formatINR(e.amount)}</td>
                          <td>{e.recurring ? "Yes" : "No"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : viz === "growth" ? (
              <div className="grid lg:grid-cols-2 gap-4">
                <div className="h-[220px]">
                  {growthChart.length === 0 ? (
                    <div className="h-full grid place-items-center text-sm text-[var(--muted)]">No growth data in this range</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={growthChart} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 4 }}>
                        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                        <YAxis type="category" dataKey="name" width={84} tick={{ fontSize: 11 }} />
                        <Tooltip
                          formatter={(value, _n, item) => [
                            `${formatINR(Number(value) || 0)} (${Number(item?.payload?.pct || 0).toFixed(0)}%)`,
                            "Growth",
                          ]}
                          labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ""}
                        />
                        <Bar dataKey="growth" radius={[0, 4, 4, 0]}>
                          {growthChart.map((d, idx) => (
                            <Cell key={idx} fill={d.growth > 0 ? "#b42318" : d.growth < 0 ? "#0c7a54" : "#5b6b7c"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <div className="space-y-2 max-h-[220px] overflow-y-auto">
                  <p className="text-xs text-[var(--muted)] mb-1">
                    Ranked by absolute change from first to last {period === "yearly" ? "year" : "month"} in range.
                  </p>
                  {[...growth]
                    .sort((a, b) => (Number(b.absolute_growth) || 0) - (Number(a.absolute_growth) || 0))
                    .map((g) => (
                      <div key={g.budget_id} className="flex items-center justify-between gap-2 text-sm border-b border-[var(--line)] py-1.5">
                        <button type="button" className="font-medium text-left hover:underline" onClick={() => { setFocusExpense(g.name); setViz("trend"); }}>
                          {g.name}
                        </button>
                        <span className={`tabular-nums font-semibold ${g.direction === "up" ? "text-[var(--danger)]" : g.direction === "down" ? "text-[var(--accent)]" : ""}`}>
                          {g.direction === "up" ? "+" : ""}{formatINR(g.absolute_growth)}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            ) : viz === "trend" ? (
              <div>
                <div className="flex flex-wrap gap-2 mb-3">
                  <button
                    type="button"
                    className={`text-xs px-2.5 py-1 rounded-md border ${!focusExpense ? "border-[var(--brand)] bg-[var(--brand-soft)]" : "border-[var(--line)]"}`}
                    onClick={() => setFocusExpense("")}
                  >
                    Top growers
                  </button>
                  {(report.trend?.series || []).map((s) => (
                    <button
                      key={s.name}
                      type="button"
                      className={`text-xs px-2.5 py-1 rounded-md border ${focusExpense === s.name ? "border-[var(--brand)] bg-[var(--brand-soft)]" : "border-[var(--line)]"}`}
                      onClick={() => setFocusExpense(s.name)}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
                <div className="h-[230px]">
                  {trendChart.length === 0 ? (
                    <div className="h-full grid place-items-center text-sm text-[var(--muted)]">No trend points in range</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendChart} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,40,70,0.08)" />
                        <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                        <Tooltip formatter={(v) => formatINR(Number(v) || 0)} />
                        <Legend />
                        {trendKeys.map((key, idx) => (
                          <Line
                            key={key}
                            type="monotone"
                            dataKey={key}
                            stroke={LINE_COLORS[idx % LINE_COLORS.length]}
                            strokeWidth={2}
                            dot={{ r: 3 }}
                            activeDot={{ r: 5 }}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            ) : viz === "bars" ? (
              <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
                {[...items]
                  .sort((a, b) => Math.abs(Number(b.deviation) || 0) - Math.abs(Number(a.deviation) || 0))
                  .map((i) => {
                    const actual = Number(i.actual_amount) || 0;
                    const budget = Number(i.budget_amount) || 0;
                    const pct = utilizationPct(actual, budget);
                    const tone = statusTone(actual, budget);
                    const fill =
                      tone === "over" ? "bg-[var(--danger)]" : tone === "warn" ? "bg-[var(--warn)]" : "bg-[var(--accent)]";
                    return (
                      <div key={i.budget_id} className="grid grid-cols-[minmax(0,1fr)_88px] gap-3 items-center">
                        <div>
                          <div className="flex justify-between gap-2 text-sm mb-1">
                            <span className="font-medium truncate">{i.name}</span>
                            <span className="text-[var(--muted)] tabular-nums text-xs shrink-0">
                              {formatINR(actual)} / {formatINR(budget)}
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-[var(--chip)] overflow-hidden">
                            <div className={`h-full ${fill}`} style={{ width: `${Math.min(100, pct)}%` }} />
                          </div>
                        </div>
                        <div className={`text-right text-sm tabular-nums font-semibold ${tone === "over" ? "text-[var(--danger)]" : "text-[var(--accent)]"}`}>
                          {pct.toFixed(0)}%
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : viz === "mix" ? (
              <div className="grid sm:grid-cols-[180px_1fr] gap-4 items-center">
                <div className="h-[180px]">
                  {mixData.length === 0 ? (
                    <div className="h-full grid place-items-center text-sm text-[var(--muted)]">No spend yet</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={mixData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={2}>
                          {mixData.map((_, idx) => (
                            <Cell key={idx} fill={MIX_COLORS[idx % MIX_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v) => formatINR(Number(v) || 0)} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <div className="space-y-2 max-h-[180px] overflow-y-auto">
                  {mixData.map((row, idx) => {
                    const share = (Number(report.total_actual) || 0) > 0 ? (row.value / Number(report.total_actual)) * 100 : 0;
                    return (
                      <div key={row.name} className="flex items-center gap-2 text-sm">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: MIX_COLORS[idx % MIX_COLORS.length] }} />
                        <span className="flex-1 truncate">{row.name}</span>
                        <span className="tabular-nums text-[var(--muted)]">{share.toFixed(0)}%</span>
                        <span className="tabular-nums font-medium w-[88px] text-right">{formatINR(row.value)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={deviationData} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 4 }}>
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <YAxis type="category" dataKey="name" width={84} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value) => formatINR(Number(value) || 0)} labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ""} />
                    <Bar dataKey="deviation" radius={[0, 4, 4, 0]}>
                      {deviationData.map((d, idx) => (
                        <Cell key={idx} fill={d.deviation > 0 ? "#b42318" : "#0c7a54"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="panel overflow-x-auto">
            <table className="table-pro">
              <thead>
                <tr>
                  <th>Expense</th>
                  <th>Budget</th>
                  <th>Actual</th>
                  <th>Growth</th>
                  <th>Used</th>
                  <th>Deviation</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => {
                  const actual = Number(i.actual_amount) || 0;
                  const budget = Number(i.budget_amount) || 0;
                  const pct = utilizationPct(actual, budget);
                  const tone = statusTone(actual, budget);
                  const g = growth.find((x) => x.name === i.name);
                  return (
                    <tr key={i.budget_id}>
                      <td className="font-medium">{i.name}</td>
                      <td className="tabular-nums">{formatINR(i.budget_amount)}</td>
                      <td className="tabular-nums">{formatINR(i.actual_amount)}</td>
                      <td className={`tabular-nums text-sm ${g?.direction === "up" ? "text-[var(--danger)]" : g?.direction === "down" ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}>
                        {g ? `${g.direction === "up" ? "↑" : g.direction === "down" ? "↓" : "→"} ${formatINR(g.absolute_growth)} (${Number(g.growth_pct).toFixed(0)}%)` : "—"}
                      </td>
                      <td>
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <div className="flex-1 h-1.5 rounded-full bg-[var(--chip)] overflow-hidden">
                            <div
                              className={`h-full ${tone === "over" ? "bg-[var(--danger)]" : tone === "warn" ? "bg-[var(--warn)]" : "bg-[var(--accent)]"}`}
                              style={{ width: `${Math.min(100, pct)}%` }}
                            />
                          </div>
                          <span className="text-xs tabular-nums w-10 text-right">{pct.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className={`tabular-nums font-semibold ${Number(i.deviation) > 0 ? "text-[var(--danger)]" : "text-[var(--accent)]"}`}>
                        {formatINR(i.deviation)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AppShell>
  );
}
