"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { api, MFHolding } from "@/lib/api";
import { formatINR } from "@/lib/format";
import { useSession } from "@/lib/useSession";

export default function MutualFundsPage() {
  const { user, loading } = useSession();
  const [items, setItems] = useState<MFHolding[]>([]);
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setItems((await api.mf()) || []);
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

  if (loading || !user) return <div className="min-h-screen grid place-items-center text-[var(--muted)]">Loading…</div>;

  const total = items.reduce((s, h) => s + (Number(h.current_value) || 0), 0);

  return (
    <AppShell
      userName={user.name}
      title="Mutual Funds"
      subtitle="Holdings ledger with weights — Value Research style review desk."
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
        <div className="kpi"><div className="text-xs uppercase tracking-wider text-[var(--muted)]">Sources</div><div className="text-sm mt-2 text-[var(--muted)]">CAMS · KFin · Manual</div></div>
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

      <div className="panel overflow-x-auto">
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
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={7} className="text-[var(--muted)]">No schemes yet. Import a CAMS/KFin CAS or add manually.</td></tr>
            ) : items.map((h) => {
              const val = Number(h.current_value) || 0;
              const weight = total > 0 ? ((val / total) * 100).toFixed(1) : "0.0";
              return (
                <tr key={h.id}>
                  <td>
                    <div className="font-medium">{h.scheme_name}</div>
                    <div className="text-xs text-[var(--muted)]">{h.amc || "—"}</div>
                  </td>
                  <td>{h.category || "—"}</td>
                  <td className="tabular-nums">{Number(h.units).toLocaleString("en-IN", { maximumFractionDigits: 4 })}</td>
                  <td className="tabular-nums">{h.nav ? Number(h.nav).toFixed(4) : "—"}</td>
                  <td className="tabular-nums font-semibold">{formatINR(h.current_value)}</td>
                  <td className="tabular-nums">{weight}%</td>
                  <td className="uppercase text-xs tracking-wide text-[var(--muted)]">{h.source}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
