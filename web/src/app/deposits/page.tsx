"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { api, ApiError, Deposit, User } from "@/lib/api";
import { formatINR } from "@/lib/format";

export default function DepositsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [items, setItems] = useState<Deposit[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const me = await api.me();
    const list = await api.deposits();
    setUser(me.user);
    setItems(list || []);
  }

  useEffect(() => {
    load().catch((err) => {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        router.replace("/login");
        return;
      }
      setError(err instanceof Error ? err.message : "Failed");
    });
  }, [router]);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await api.createDeposit({
        type: fd.get("type"),
        bank_name: fd.get("bank_name"),
        principal: fd.get("principal"),
        interest_rate: fd.get("interest_rate"),
        start_date: new Date(String(fd.get("start_date"))).toISOString(),
        maturity_date: new Date(String(fd.get("maturity_date"))).toISOString(),
        compounding: "quarterly",
        alert_days_before: 14,
      });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  }

  if (!user) {
    return <div className="min-h-screen grid place-items-center text-[var(--muted)]">Loading…</div>;
  }

  return (
    <AppShell userName={user.name}>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-xs tracking-[0.22em] uppercase text-[var(--muted)]">Deposits</p>
          <h1
            className="mt-2 text-4xl text-[var(--accent-strong)]"
            style={{ fontFamily: "var(--font-display), Georgia, serif" }}
          >
            FD & RD
          </h1>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-xl bg-[var(--accent)] text-[#12160f] font-semibold px-4 py-2.5"
        >
          {showForm ? "Cancel" : "Add deposit"}
        </button>
      </div>

      {error && <p className="mb-4 text-[var(--danger)] text-sm">{error}</p>}

      {showForm && (
        <form
          onSubmit={onCreate}
          className="mb-8 grid gap-3 sm:grid-cols-2 rounded-[var(--radius)] border border-[var(--line)] bg-[rgba(22,32,28,0.55)] p-5"
        >
          <Field name="type" label="Type" as="select">
            <option value="FD">FD</option>
            <option value="RD">RD</option>
          </Field>
          <Field name="bank_name" label="Bank" placeholder="HDFC / SBI / …" required />
          <Field name="principal" label="Principal (₹)" type="number" step="0.01" required />
          <Field name="interest_rate" label="Interest %" type="number" step="0.01" required />
          <Field name="start_date" label="Start date" type="date" required />
          <Field name="maturity_date" label="Maturity date" type="date" required />
          <div className="sm:col-span-2">
            <button type="submit" className="rounded-xl bg-[var(--accent)] text-[#12160f] font-semibold px-4 py-2.5">
              Save deposit
            </button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--line)]">
        <table className="w-full text-sm">
          <thead className="bg-[rgba(0,0,0,0.25)] text-[var(--muted)] text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Bank</th>
              <th className="px-4 py-3 font-medium">Principal</th>
              <th className="px-4 py-3 font-medium">Rate</th>
              <th className="px-4 py-3 font-medium">Matures</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[var(--muted)]">
                  No deposits yet. Add your first FD or RD.
                </td>
              </tr>
            ) : (
              items.map((d) => (
                <tr key={d.id} className="border-t border-[var(--line)]">
                  <td className="px-4 py-3">{d.type}</td>
                  <td className="px-4 py-3">{d.bank_name}</td>
                  <td className="px-4 py-3">{formatINR(d.principal)}</td>
                  <td className="px-4 py-3">{d.interest_rate}%</td>
                  <td className="px-4 py-3">{new Date(d.maturity_date).toLocaleDateString("en-IN")}</td>
                  <td className="px-4 py-3 capitalize text-[var(--positive)]">{d.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

function Field({
  name,
  label,
  as,
  children,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & {
  name: string;
  label: string;
  as?: "select";
  children?: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="text-[var(--muted)]">{label}</span>
      {as === "select" ? (
        <select
          name={name}
          className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-[rgba(0,0,0,0.25)] px-3 py-2.5"
        >
          {children}
        </select>
      ) : (
        <input
          name={name}
          className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-[rgba(0,0,0,0.25)] px-3 py-2.5"
          {...rest}
        />
      )}
    </label>
  );
}
