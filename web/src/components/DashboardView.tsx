"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { formatINR } from "@/lib/format";
import type { DashboardSummary } from "@/lib/api";

const allocationDemo = [
  { name: "Deposits", key: "deposits", color: "var(--chart-1)" },
  { name: "Mutual Funds", key: "mf", color: "var(--chart-2)" },
  { name: "Goals saved", key: "goals", color: "var(--chart-3)" },
];

const cashflowDemo = [
  { month: "May", income: 180000, expense: 92000 },
  { month: "Jun", income: 180000, expense: 101000 },
  { month: "Jul", income: 195000, expense: 88000 },
  { month: "Aug", income: 180000, expense: 110000 },
  { month: "Sep", income: 210000, expense: 97000 },
  { month: "Oct", income: 180000, expense: 85000 },
];

export function DashboardView({ data }: { data: DashboardSummary }) {
  const pieData = [
    { name: "Deposits", value: Number(data.total_deposits) || 0, color: "#c4b58a" },
    { name: "Mutual Funds", value: Number(data.total_mf_value) || 0, color: "#3dcf9a" },
    { name: "Goals saved", value: Number(data.total_goals_saved) || 0, color: "#6bb3d9" },
  ].filter((d) => d.value > 0);

  const hasAllocation = pieData.length > 0;
  const netWorth =
    (Number(data.total_deposits) || 0) + (Number(data.total_mf_value) || 0);

  return (
    <div className="space-y-8">
      <header className="max-w-3xl">
        <p className="text-xs tracking-[0.22em] uppercase text-[var(--muted)]">Overview</p>
        <h1
          className="mt-2 text-4xl sm:text-5xl tracking-tight text-[var(--accent-strong)]"
          style={{ fontFamily: "var(--font-display), Georgia, serif" }}
        >
          Your vault at a glance
        </h1>
        <p className="mt-3 text-[var(--muted)] text-base max-w-xl">
          Track deposits, funds, goals, and monthly cashflow in one private place.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Net invested" value={formatINR(netWorth)} hint="FD/RD + MF" />
        <Stat
          label="Goals progress"
          value={`${formatINR(data.total_goals_saved)} / ${formatINR(data.total_goals_target)}`}
          hint="Linked savings"
        />
        <Stat
          label="This month"
          value={`${formatINR(data.month_income)} in`}
          hint={`${formatINR(data.month_expense)} out`}
        />
        <Stat
          label="Attention"
          value={`${data.upcoming_maturities} maturities`}
          hint={`${data.active_policies} active policies`}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="Cashflow trend" subtitle="Income vs expense (sample until you add entries)">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cashflowDemo}>
                <defs>
                  <linearGradient id="inc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3dcf9a" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#3dcf9a" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="exp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#e8a45c" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#e8a45c" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(196,181,138,0.08)" vertical={false} />
                <XAxis dataKey="month" stroke="#9aa89f" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis
                  stroke="#9aa89f"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                />
                <Tooltip
                  contentStyle={{
                    background: "#121a17",
                    border: "1px solid rgba(196,181,138,0.2)",
                    borderRadius: 12,
                  }}
                  formatter={(v) => formatINR(Number(v))}
                />
                <Area type="monotone" dataKey="income" stroke="#3dcf9a" fill="url(#inc)" strokeWidth={2} />
                <Area type="monotone" dataKey="expense" stroke="#e8a45c" fill="url(#exp)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Allocation" subtitle="Live from your vault">
          <div className="h-72 flex items-center justify-center">
            {hasAllocation ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={90} paddingAngle={3}>
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "#121a17",
                      border: "1px solid rgba(196,181,138,0.2)",
                      borderRadius: 12,
                    }}
                    formatter={(v) => formatINR(Number(v))}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center px-6">
                <p className="text-[var(--muted)] text-sm">
                  Add an FD/RD or mutual fund holding to see allocation.
                </p>
                <ul className="mt-4 space-y-2 text-left text-sm text-[var(--muted)]">
                  {allocationDemo.map((a) => (
                    <li key={a.key} className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: a.color }} />
                      {a.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Panel>
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--line)] bg-[rgba(22,32,28,0.7)] px-5 py-4 shadow-[var(--shadow)]">
      <div className="text-xs tracking-[0.16em] uppercase text-[var(--muted)]">{label}</div>
      <div
        className="mt-2 text-2xl text-[var(--accent-strong)]"
        style={{ fontFamily: "var(--font-display), Georgia, serif" }}
      >
        {value}
      </div>
      <div className="mt-1 text-sm text-[var(--muted)]">{hint}</div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius)] border border-[var(--line)] bg-[rgba(22,32,28,0.55)] p-5 shadow-[var(--shadow)]">
      <div className="mb-4">
        <h2
          className="text-xl text-[var(--accent-strong)]"
          style={{ fontFamily: "var(--font-display), Georgia, serif" }}
        >
          {title}
        </h2>
        <p className="text-sm text-[var(--muted)] mt-1">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}
