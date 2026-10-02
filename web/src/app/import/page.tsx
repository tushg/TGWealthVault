"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";
import { useSession } from "@/lib/useSession";

export default function ImportPage() {
  const { user, loading } = useSession();
  const [statements, setStatements] = useState<Record<string, unknown>[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setStatements((await api.statements()) || []);
  }

  useEffect(() => {
    if (user) load().catch(() => undefined);
  }, [user]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setErr(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      const res = await api.importMF(fd);
      setMsg(`Imported ${res.holdings_imported} scheme(s), ${res.transactions_imported || 0} transaction(s) from ${res.source.toUpperCase()}. ${res.notes || ""}`);
      form.reset();
      await load();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !user) return <div className="min-h-screen grid place-items-center text-[var(--muted)]">Loading…</div>;

  return (
    <AppShell
      userName={user.name}
      title="Import statements"
      subtitle="CAMS / KFin Consolidated Account Statement — same workflow as research portfolio managers."
    >
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <form onSubmit={onSubmit} className="panel p-6 space-y-4">
          <div>
            <h2 className="text-lg" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>Upload CAS</h2>
          <p className="text-sm text-[var(--muted)] mt-1">
            Upload CAMS <strong>Detailed</strong> Consolidated Account Statement (PDF/CSV/TXT). We parse transactions and create MF holdings by scheme name.
            Password-protected PDFs: unlock/export text or paste statement text below.
          </p>
          </div>
          <label>
            <span className="label">Source</span>
            <select name="source" className="field" defaultValue="cams">
              <option value="cams">CAMS</option>
              <option value="kfin">KFintech</option>
            </select>
          </label>
          <label>
            <span className="label">Statement file (PDF / CSV / TXT)</span>
            <input name="file" type="file" accept=".pdf,.csv,.txt" className="field" />
          </label>
          <label>
            <span className="label">PDF password (stored encrypted)</span>
            <input name="password" type="password" className="field" placeholder="PAN / statement password" />
          </label>
          <label>
            <span className="label">Or paste CAS / CSV text</span>
            <textarea name="text" rows={8} className="field font-mono text-xs" placeholder={"scheme,folio,units,nav,value,amc,category\nParag Parikh Flexi Cap,12345678,120.5,75.2,9051.60,PPFAS,Equity"} />
          </label>
          <button className="btn-primary" disabled={busy} type="submit">
            {busy ? "Importing…" : "Import into vault"}
          </button>
          {msg && <p className="text-sm text-[var(--accent)]">{msg}</p>}
          {err && <p className="text-sm text-[var(--danger)]">{err}</p>}
        </form>

        <div className="panel overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--line)]">
            <h2 className="text-lg" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>Import history</h2>
          </div>
          <table className="table-pro">
            <thead>
              <tr>
                <th>File</th>
                <th>Source</th>
                <th>Status</th>
                <th>Holdings</th>
                <th>Txns</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {statements.length === 0 ? (
                <tr><td colSpan={6} className="text-[var(--muted)]">No imports yet.</td></tr>
              ) : statements.map((s) => (
                <tr key={String(s.id)}>
                  <td className="max-w-[160px] truncate">{String(s.filename)}</td>
                  <td className="uppercase text-xs">{String(s.source)}</td>
                  <td>{String(s.status)}</td>
                  <td className="tabular-nums">{String(s.holdings_imported ?? 0)}</td>
                  <td className="tabular-nums">{String(s.transactions_imported ?? 0)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn-ghost text-xs py-1 px-2 text-[var(--danger)] border-[rgba(180,35,24,0.35)]"
                      onClick={async () => {
                        if (!confirm("Delete this import record?")) return;
                        await api.deleteStatement(String(s.id));
                        await load();
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
    </AppShell>
  );
}
