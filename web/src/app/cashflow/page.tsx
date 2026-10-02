"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { api, CashflowEntry, ExpenseBudget } from "@/lib/api";
import { formatINR } from "@/lib/format";
import { useSession } from "@/lib/useSession";

function ymNow(offset = 0) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Stable YYYY-MM from API date without timezone day-shift. */
function entryYm(value: string) {
  const m = String(value || "").match(/^(\d{4}-\d{2})/);
  if (m) return m[1];
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function applyLocalFilter(
  rows: CashflowEntry[],
  filterType: "all" | "expense" | "income",
  monthMode: "single" | "range" | "all",
  filterMonth: string,
  rangeFrom: string,
  rangeTo: string,
) {
  return rows.filter((e) => {
    if (filterType !== "all" && e.type !== filterType) return false;
    const ym = entryYm(e.entry_month);
    if (!ym) return false;
    if (monthMode === "single") return ym === filterMonth;
    if (monthMode === "range") {
      if (rangeFrom && ym < rangeFrom) return false;
      if (rangeTo && ym > rangeTo) return false;
      return true;
    }
    return true;
  });
}

export default function CashflowPage() {
  const { user, loading } = useSession();
  const [allItems, setAllItems] = useState<CashflowEntry[]>([]);
  const [budgets, setBudgets] = useState<ExpenseBudget[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [categoryMode, setCategoryMode] = useState<"budget" | "custom">("budget");
  const [filterMonth, setFilterMonth] = useState(ymNow(0));
  const [filterType, setFilterType] = useState<"all" | "expense" | "income">("expense");
  const [monthMode, setMonthMode] = useState<"single" | "range" | "all">("single");
  const [rangeFrom, setRangeFrom] = useState(ymNow(-5));
  const [rangeTo, setRangeTo] = useState(ymNow(0));
  const reqSeq = useRef(0);

  // Month filtering is done in the UI from the loaded set (reliable + instant).
  const items = useMemo(
    () => applyLocalFilter(allItems, filterType, monthMode, filterMonth, rangeFrom, rangeTo),
    [allItems, filterType, monthMode, filterMonth, rangeFrom, rangeTo],
  );

  async function loadFromServer() {
    const seq = ++reqSeq.current;
    setBusy(true);
    setError(null);
    try {
      // Load by type only; month/range filters apply locally so they always stick.
      const params: { type?: string } = {};
      if (filterType !== "all") params.type = filterType;
      const cf = await api.cashflow(params);
      if (seq !== reqSeq.current) return;
      setAllItems(cf || []);
      try {
        const eb = await api.expenseBudgets();
        if (seq === reqSeq.current) setBudgets((eb || []).filter((b) => b.active));
      } catch {
        /* budgets optional for list view */
      }
    } catch (e) {
      if (seq === reqSeq.current) {
        setError(e instanceof Error ? e.message : "Failed to load");
      }
    } finally {
      if (seq === reqSeq.current) setBusy(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    loadFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, filterType]);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const month = String(fd.get("entry_month") || "").trim();
    const type = String(fd.get("type") || "expense");
    let category = String(fd.get("category") || "").trim();
    if (type === "expense" && categoryMode === "budget") {
      category = String(fd.get("budget_category") || "").trim();
    }
    if (!category) {
      setError("Category is required");
      return;
    }
    try {
      await api.createCashflow({
        type,
        category,
        amount: String(fd.get("amount") || ""),
        entry_month: `${month}-01T12:00:00.000Z`,
        recurring: fd.get("recurring") === "on",
      });
      e.currentTarget.reset();
      setMonthMode("single");
      setFilterMonth(month);
      setFilterType(type === "income" ? "income" : "expense");
      await loadFromServer();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add entry");
    }
  }

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const e of items) {
      if (e.type === "income") income += Number(e.amount) || 0;
      else expense += Number(e.amount) || 0;
    }
    return { income, expense, surplus: income - expense };
  }, [items]);

  const grouped = useMemo(() => {
    const map = new Map<string, CashflowEntry[]>();
    for (const e of items) {
      const key = entryYm(e.entry_month);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [items]);

  const filterSummary = useMemo(() => {
    if (monthMode === "single") return monthLabel(filterMonth);
    if (monthMode === "range") return `${monthLabel(rangeFrom)} → ${monthLabel(rangeTo)}`;
    return "All months";
  }, [monthMode, filterMonth, rangeFrom, rangeTo]);

  if (loading || !user) return <div className="min-h-screen grid place-items-center text-[var(--muted)]">Loading…</div>;

  return (
    <AppShell
      userName={user.name}
      title="Cashflow"
      subtitle="Browse every expense by month, or add new income and expense entries."
      actions={
        <div className="flex gap-2">
          <Link href="/cashflow/budget" className="btn-ghost">Expense Budget</Link>
          <Link href="/cashflow/expense-report" className="btn-ghost">Expense Report</Link>
        </div>
      }
    >
      <div className="grid sm:grid-cols-3 gap-3 mb-6">
        <div className="kpi"><div className="text-xs uppercase tracking-wider text-[var(--muted)]">Income</div><div className="text-2xl mt-1 tabular-nums text-[var(--accent)]" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>{formatINR(totals.income)}</div></div>
        <div className="kpi"><div className="text-xs uppercase tracking-wider text-[var(--muted)]">Expense</div><div className="text-2xl mt-1 tabular-nums text-[var(--warn)]" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>{formatINR(totals.expense)}</div></div>
        <div className="kpi"><div className="text-xs uppercase tracking-wider text-[var(--muted)]">Surplus</div><div className="text-2xl mt-1 tabular-nums" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>{formatINR(totals.surplus)}</div></div>
      </div>

      {error && <p className="text-[var(--danger)] text-sm mb-4">{error}</p>}

      <div className="panel p-4 mb-6 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <label>
            <span className="label">Show</span>
            <select className="field" value={filterType} onChange={(e) => setFilterType(e.target.value as typeof filterType)}>
              <option value="expense">Expenses only</option>
              <option value="income">Income only</option>
              <option value="all">All entries</option>
            </select>
          </label>
          <label>
            <span className="label">Month filter</span>
            <select className="field" value={monthMode} onChange={(e) => setMonthMode(e.target.value as typeof monthMode)}>
              <option value="single">Specific month</option>
              <option value="range">Month range</option>
              <option value="all">All months</option>
            </select>
          </label>
          {monthMode === "single" && (
            <label>
              <span className="label">View month</span>
              <input
                className="field"
                type="month"
                value={filterMonth}
                onChange={(e) => {
                  setMonthMode("single");
                  setFilterMonth(e.target.value);
                }}
              />
            </label>
          )}
          {monthMode === "range" && (
            <>
              <label>
                <span className="label">From</span>
                <input className="field" type="month" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} />
              </label>
              <label>
                <span className="label">To</span>
                <input className="field" type="month" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} />
              </label>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className="btn-ghost text-xs py-1.5 px-2.5"
            onClick={() => {
              setMonthMode("single");
              setFilterMonth(ymNow(0));
              setFilterType("expense");
            }}
          >
            Current month
          </button>
          <button
            type="button"
            className="btn-ghost text-xs py-1.5 px-2.5"
            onClick={() => {
              setMonthMode("single");
              setFilterMonth(ymNow(-1));
              setFilterType("expense");
            }}
          >
            Last month
          </button>
          <button
            type="button"
            className="btn-ghost text-xs py-1.5 px-2.5"
            onClick={() => {
              setMonthMode("range");
              setRangeFrom(ymNow(-5));
              setRangeTo(ymNow(0));
              setFilterType("expense");
            }}
          >
            Last 6 months
          </button>
          <button
            type="button"
            className="btn-ghost text-xs py-1.5 px-2.5"
            onClick={() => {
              setMonthMode("all");
              setFilterType("expense");
            }}
          >
            All months
          </button>
        </div>
        <p className="text-xs text-[var(--muted)]">
          Showing <span className="font-semibold text-[var(--ink)]">{filterSummary}</span>
          {" · "}
          <span className="font-semibold text-[var(--ink)]">{items.length}</span> entr{items.length === 1 ? "y" : "ies"}
          {busy ? " · refreshing…" : ""}
        </p>
      </div>

      <form onSubmit={onCreate} className="panel p-5 mb-6 grid gap-3 sm:grid-cols-5">
        <label>
          <span className="label">Type</span>
          <select
            className="field"
            name="type"
            defaultValue="expense"
            onChange={(e) => {
              if (e.target.value === "income") setCategoryMode("custom");
              else setCategoryMode(budgets.length ? "budget" : "custom");
            }}
          >
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
        </label>
        {categoryMode === "budget" && budgets.length > 0 ? (
          <label>
            <span className="label">Budget expense</span>
            <select className="field" name="budget_category" required defaultValue={budgets[0]?.name}>
              {budgets.map((b) => (
                <option key={b.id} value={b.name}>
                  {b.name} (₹{Number(b.allocated_amount).toLocaleString("en-IN")}/mo)
                </option>
              ))}
            </select>
            <button type="button" className="text-xs text-[var(--brand)] mt-1" onClick={() => setCategoryMode("custom")}>
              Use custom category
            </button>
          </label>
        ) : (
          <label>
            <span className="label">Category</span>
            <input className="field" name="category" required placeholder="Salary / Rent / SIP" />
            {budgets.length > 0 && (
              <button type="button" className="text-xs text-[var(--brand)] mt-1" onClick={() => setCategoryMode("budget")}>
                Pick from budget list
              </button>
            )}
          </label>
        )}
        <label>
          <span className="label">Amount ₹</span>
          <input className="field" name="amount" type="number" step="0.01" required />
        </label>
        <label>
          <span className="label">Entry month</span>
          <input className="field" name="entry_month" type="month" required defaultValue={ymNow(0)} />
        </label>
        <div className="flex items-end gap-3">
          <label className="text-sm flex items-center gap-2">
            <input type="checkbox" name="recurring" /> Recurring
          </label>
          <button className="btn-primary" type="submit">
            Add
          </button>
        </div>
      </form>

      {grouped.length === 0 ? (
        <div className="panel p-6 text-[var(--muted)]">
          No entries for <strong>{filterSummary}</strong>. Try another month, or load sample data from Expense Report.
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([ym, rows]) => {
            const monthTotal = rows.reduce((s, r) => s + (r.type === "expense" ? Number(r.amount) || 0 : 0), 0);
            const monthIncome = rows.reduce((s, r) => s + (r.type === "income" ? Number(r.amount) || 0 : 0), 0);
            return (
              <div key={ym} className="panel overflow-hidden">
                <div className="px-5 py-3 border-b border-[var(--line)] flex flex-wrap items-center justify-between gap-2 bg-[var(--bg-soft)]">
                  <h2 className="text-base font-semibold" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>
                    {monthLabel(ym)}
                  </h2>
                  <div className="text-sm text-[var(--muted)]">
                    {monthIncome > 0 && <span className="mr-3">Income {formatINR(monthIncome)}</span>}
                    <span>
                      Expenses {formatINR(monthTotal)} · {rows.length} entr{rows.length === 1 ? "y" : "ies"}
                    </span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="table-pro">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Category</th>
                        <th>Amount</th>
                        <th>Recurring</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((e) => (
                        <tr key={e.id}>
                          <td className="capitalize">{e.type}</td>
                          <td className="font-medium">{e.category}</td>
                          <td className={`tabular-nums font-semibold ${e.type === "expense" ? "text-[var(--warn)]" : "text-[var(--accent)]"}`}>
                            {formatINR(e.amount)}
                          </td>
                          <td>{e.recurring ? "Yes" : "No"}</td>
                          <td>
                            <button
                              type="button"
                              className="btn-ghost text-xs py-1 px-2 text-[var(--danger)] border-[rgba(180,35,24,0.35)]"
                              onClick={async () => {
                                if (!confirm("Delete this entry?")) return;
                                await api.deleteCashflow(e.id);
                                await loadFromServer();
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
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
