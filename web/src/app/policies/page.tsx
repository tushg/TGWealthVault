"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api, Policy } from "@/lib/api";
import { formatINR } from "@/lib/format";
import { useSession } from "@/lib/useSession";

export default function PoliciesPage() {
  const { user, loading } = useSession();
  const [items, setItems] = useState<Policy[]>([]);
  const [show, setShow] = useState(false);

  async function load() {
    setItems((await api.policies()) || []);
  }
  useEffect(() => {
    if (user) load().catch(() => undefined);
  }, [user]);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await api.createPolicy({
      insurer: fd.get("insurer"),
      policy_type: fd.get("policy_type"),
      premium_amount: fd.get("premium_amount") || null,
      premium_frequency: fd.get("premium_frequency") || "yearly",
      sum_assured: fd.get("sum_assured") || null,
      next_due_date: fd.get("next_due_date") ? new Date(String(fd.get("next_due_date"))).toISOString() : null,
    });
    setShow(false);
    await load();
  }

  if (loading || !user) return <div className="min-h-screen grid place-items-center text-[var(--muted)]">Loading…</div>;

  return (
    <AppShell
      userName={user.name}
      title="Protect"
      subtitle="Life, health, and term cover register — premium dues in one place."
      actions={<button className="btn-primary" onClick={() => setShow((v) => !v)}>{show ? "Cancel" : "Add policy"}</button>}
    >
      {show && (
        <form onSubmit={onCreate} className="panel p-5 mb-6 grid gap-3 sm:grid-cols-3">
          <label><span className="label">Insurer</span><input className="field" name="insurer" required placeholder="LIC / HDFC Life / …" /></label>
          <label><span className="label">Type</span>
            <select className="field" name="policy_type">
              <option>Term</option><option>Health</option><option>Endowment</option><option>ULIP</option><option>Other</option>
            </select>
          </label>
          <label><span className="label">Sum assured ₹</span><input className="field" name="sum_assured" type="number" /></label>
          <label><span className="label">Premium ₹</span><input className="field" name="premium_amount" type="number" /></label>
          <label><span className="label">Frequency</span>
            <select className="field" name="premium_frequency"><option>yearly</option><option>monthly</option><option>quarterly</option></select>
          </label>
          <label><span className="label">Next due</span><input className="field" name="next_due_date" type="date" /></label>
          <div className="sm:col-span-3"><button className="btn-primary" type="submit">Save policy</button></div>
        </form>
      )}

      <div className="panel overflow-x-auto">
        <table className="table-pro">
          <thead>
            <tr><th>Insurer</th><th>Type</th><th>Sum assured</th><th>Premium</th><th>Next due</th><th>Status</th></tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={6} className="text-[var(--muted)]">No policies yet.</td></tr>
            ) : items.map((p) => (
              <tr key={p.id}>
                <td className="font-medium">{p.insurer}</td>
                <td>{p.policy_type}</td>
                <td className="tabular-nums">{formatINR(p.sum_assured)}</td>
                <td className="tabular-nums">{formatINR(p.premium_amount)} <span className="text-xs text-[var(--muted)]">/{p.premium_frequency || "—"}</span></td>
                <td>{p.next_due_date ? new Date(p.next_due_date).toLocaleDateString("en-IN") : "—"}</td>
                <td className="capitalize text-[var(--accent)]">{p.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
