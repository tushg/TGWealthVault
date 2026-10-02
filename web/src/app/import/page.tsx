"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";
import { useSession } from "@/lib/useSession";

const SAMPLE_SUMMARY = `PORTFOLIO SUMMARY
Mutual Fund Cost Value(INR) Market Value(INR)
ICICI Prudential Mutual Fund 4,83,000.00 4,96,262.24
HDFC Mutual Fund 3,25,599.31 8,64,311.17
SBI Mutual Fund 7,66,500.00 9,05,825.51
PPFAS Mutual Fund 4,68,447.10 9,25,218.62
Kotak Mutual Fund 2,56,000.00 4,37,366.72
Franklin Templeton Mutual Fund 81,000.00 99,175.93
Helios Mutual Fund 2,71,048.34 2,80,605.16
Bandhan Mutual Fund 1,46,000.00 1,49,394.06
AXIS Mutual Fund 7,500.00 7,502.39
Invesco Mutual Fund 5,000.00 4,999.74
Mirae Asset Mutual Fund 2,47,500.00 5,05,489.05
Total 30,57,594.75 46,76,150.58`;

export default function ImportPage() {
  const { user, loading } = useSession();
  const [statements, setStatements] = useState<Record<string, unknown>[]>([]);
  const [text, setText] = useState(SAMPLE_SUMMARY);
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
    fd.set("text", text);
    fd.set("replace", "true");
    try {
      const res = await api.importMF(fd);
      setMsg(`Imported ${res.holdings_imported} fund(s), ${res.transactions_imported || 0} txn(s). ${res.notes || ""}`);
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
      subtitle="Paste CAMS PORTFOLIO SUMMARY (cost + market value). Re-import replaces previous CAMS/KFin holdings."
    >
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <form onSubmit={onSubmit} className="panel p-6 space-y-4">
          <div>
            <h2 className="text-lg" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>CAMS Portfolio Summary</h2>
            <p className="text-sm text-[var(--muted)] mt-1">
              PDF screenshots are not OCR’d automatically. Paste the summary table text (pre-filled from your statement screenshot). Each Mutual Fund row becomes an MF entry with cost & market value.
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
            <span className="label">Optional file (PDF/CSV/TXT — not images)</span>
            <input name="file" type="file" accept=".pdf,.csv,.txt" className="field" />
          </label>
          <label>
            <span className="label">Portfolio summary / CAS text</span>
            <textarea
              name="text"
              rows={14}
              className="field font-mono text-xs"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <p className="text-xs text-[var(--muted)]">Re-import always replaces existing CAMS/KFin holdings, then inserts the newly parsed funds.</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" disabled={busy} type="submit">
              {busy ? "Importing…" : "Replace & import into MF"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setText(SAMPLE_SUMMARY)}>
              Reset sample summary
            </button>
          </div>
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
