"use client";

import Link from "next/link";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PortfolioOverview } from "@/lib/api";
import { formatINR } from "@/lib/format";

const COLORS = ["#0a4d8c", "#0c7a54", "#9a6700", "#5b6b7c"];

export function PortfolioView({ data }: { data: PortfolioOverview }) {
  const pie = (data.allocation || []).map((a, i) => ({
    name: a.name,
    value: Number(a.value) || 0,
    color: COLORS[i % COLORS.length],
  }));

  const cashTrend = [
    { m: "May", surplus: 70000 },
    { m: "Jun", surplus: 55000 },
    { m: "Jul", surplus: 82000 },
    { m: "Aug", surplus: 61000 },
    { m: "Sep", surplus: 94000 },
    { m: "Oct", surplus: Number(data.month_surplus) || 0 },
  ];

  return (
    <div className="space-y-6">
      <section className="panel overflow-hidden">
        <div className="grid lg:grid-cols-[1.4fr_1fr]">
          <div className="p-6 sm:p-8 bg-[linear-gradient(135deg,#073560_0%,#0a4d8c_55%,#0c6794_100%)] text-white">
            <p className="text-xs tracking-[0.2em] uppercase text-white/65">Total portfolio value</p>
            <div className="mt-3 text-4xl sm:text-5xl tabular-nums" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>
              {formatINR(data.net_worth)}
            </div>
            <p className="mt-3 text-sm text-white/75 max-w-lg">
              Deposits {formatINR(data.total_deposits)} · Mutual funds {formatINR(data.total_mf_value)} · {data.mf_count} schemes
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href="/import" className="rounded-lg bg-white text-[var(--brand-deep)] px-3.5 py-2 text-sm font-semibold">
                Import CAS
              </Link>
              <Link href="/goals" className="rounded-lg border border-white/35 px-3.5 py-2 text-sm font-semibold text-white">
                Goal missions
              </Link>
            </div>
          </div>
          <div className="p-6 grid grid-cols-2 gap-3 content-center">
            <MiniKPI label="Goal funded" value={`${data.goal_funding_pct || 0}%`} hint={`${formatINR(data.total_goals_saved)} saved`} />
            <MiniKPI label="Month surplus" value={formatINR(data.month_surplus)} hint={`${formatINR(data.month_income)} in`} />
            <MiniKPI label="Maturing 30d" value={String(data.upcoming_maturities)} hint="FD / RD alerts" />
            <MiniKPI label="Policies" value={String(data.active_policies)} hint="Active cover" />
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="panel p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>Asset allocation</h2>
              <p className="text-sm text-[var(--muted)]">Live mix across your vault</p>
            </div>
          </div>
          <div className="h-64 grid sm:grid-cols-2 gap-4 items-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pie.length ? pie : [{ name: "Empty", value: 1 }]} dataKey="value" innerRadius={55} outerRadius={88} paddingAngle={2}>
                  {(pie.length ? pie : [{ color: "#d7dee8" }]).map((e, i) => (
                    <Cell key={i} fill={e.color || "#d7dee8"} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatINR(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
            <ul className="space-y-3">
              {(data.allocation || []).length === 0 && (
                <li className="text-sm text-[var(--muted)]">Import a CAS or add an FD to see allocation weights.</li>
              )}
              {(data.allocation || []).map((a, i) => (
                <li key={a.name} className="flex items-center justify-between text-sm">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    {a.name}
                  </span>
                  <span className="tabular-nums font-semibold">{a.weight}% · {formatINR(a.value)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="panel p-5">
          <h2 className="text-lg" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>Investable surplus</h2>
          <p className="text-sm text-[var(--muted)] mb-4">Cashflow leftover trending into goals</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cashTrend}>
                <defs>
                  <linearGradient id="sur" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0a4d8c" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#0a4d8c" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e6ebf1" vertical={false} />
                <XAxis dataKey="m" tickLine={false} axisLine={false} stroke="#5b6b7c" fontSize={12} />
                <YAxis tickLine={false} axisLine={false} stroke="#5b6b7c" fontSize={12} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v) => formatINR(Number(v))} />
                <Area type="monotone" dataKey="surplus" stroke="#0a4d8c" fill="url(#sur)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="panel overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--line)] flex items-center justify-between">
            <h2 className="text-lg" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>Top holdings</h2>
            <Link href="/mutual-funds" className="text-sm font-semibold text-[var(--brand)]">View all</Link>
          </div>
          <table className="table-pro">
            <thead>
              <tr>
                <th>Scheme</th>
                <th>Category</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {(data.top_holdings || []).length === 0 ? (
                <tr><td colSpan={3} className="text-[var(--muted)]">No holdings yet — import CAS to populate.</td></tr>
              ) : (
                data.top_holdings.map((h) => (
                  <tr key={h.id}>
                    <td>
                      <div className="font-medium">{h.scheme_name}</div>
                      <div className="text-xs text-[var(--muted)]">{h.amc || h.source}</div>
                    </td>
                    <td>{h.category || "—"}</td>
                    <td className="tabular-nums font-semibold">{formatINR(h.current_value)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="panel p-5">
          <h2 className="text-lg mb-3" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>Action centre</h2>
          <div className="space-y-3">
            {(data.actions || []).length === 0 && (
              <p className="text-sm text-[var(--muted)]">You&apos;re clear — no urgent portfolio actions.</p>
            )}
            {(data.actions || []).map((a) => (
              <Link key={a.title} href={a.href} className="block rounded-xl border border-[var(--line)] bg-[var(--bg-soft)] p-3.5 hover:border-[var(--brand)] transition">
                <div className="text-xs uppercase tracking-wider text-[var(--muted)]">{a.severity}</div>
                <div className="mt-1 font-semibold">{a.title}</div>
                <div className="text-sm text-[var(--muted)] mt-0.5">{a.detail}</div>
              </Link>
            ))}
          </div>

          <h3 className="mt-6 mb-3 text-sm font-semibold text-[var(--muted)] uppercase tracking-wider">Goal missions</h3>
          <div className="space-y-3">
            {(data.goals || []).slice(0, 3).map((g) => {
              const pct = Math.min(100, (Number(g.current_amount) / Math.max(1, Number(g.target_amount))) * 100);
              return (
                <div key={g.id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">{g.name}</span>
                    <span className="tabular-nums text-[var(--muted)]">{pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--chip)] overflow-hidden">
                    <div className="h-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            {(data.goals || []).length === 0 && <p className="text-sm text-[var(--muted)]">No goals yet.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}

function MiniKPI({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-soft)] p-3">
      <div className="text-[11px] uppercase tracking-wider text-[var(--muted)]">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>{value}</div>
      <div className="text-xs text-[var(--muted)] mt-0.5">{hint}</div>
    </div>
  );
}
