"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { api, VaultAlert } from "@/lib/api";
import { useSession } from "@/lib/useSession";

type Filter = "open" | "confirmed" | "all";

export default function AlertsPage() {
  const { user, loading } = useSession();
  const [filter, setFilter] = useState<Filter>("open");
  const [items, setItems] = useState<VaultAlert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load(next: Filter = filter) {
    const status = next === "all" ? undefined : next;
    setItems((await api.alerts(status)) || []);
  }

  useEffect(() => {
    if (user) load(filter).catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, filter]);

  async function confirm(id: string) {
    setBusyId(id);
    try {
      await api.confirmAlert(id);
      await load(filter);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Confirm failed");
    } finally {
      setBusyId(null);
    }
  }

  if (loading || !user) return <div className="min-h-screen grid place-items-center text-[var(--muted)]">Loading…</div>;

  return (
    <AppShell
      userName={user.name}
      title="Alerts"
      subtitle="Maturity notices and vault actions — confirm once reviewed."
    >
      <div className="inline-flex rounded-xl border border-[var(--line)] bg-white p-1 mb-6">
        {([
          ["open", "Open"],
          ["confirmed", "Confirmed"],
          ["all", "All"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
              filter === key ? "bg-[var(--brand)] text-white" : "text-[var(--muted)] hover:text-[var(--ink)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-[var(--danger)] mb-4">{error}</p>}

      <div className="space-y-3">
        {items.length === 0 && (
          <div className="panel p-8 text-center text-[var(--muted)]">
            No {filter === "all" ? "" : filter + " "}alerts right now.
          </div>
        )}
        {items.map((a) => (
          <article key={a.id} className="panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wider">
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${
                    a.severity === "critical"
                      ? "bg-[rgba(180,35,24,0.12)] text-[var(--danger)]"
                      : a.severity === "warn"
                        ? "bg-[rgba(154,103,0,0.12)] text-[var(--warn)]"
                        : "bg-[var(--brand-soft)] text-[var(--brand)]"
                  }`}>{a.severity}</span>
                  <span className="text-[var(--muted)]">{a.kind.replaceAll("_", " ")}</span>
                  <span className="text-[var(--muted)]">· {new Date(a.created_at).toLocaleString("en-IN")}</span>
                </div>
                <h2 className="mt-2 text-lg" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>{a.title}</h2>
                <p className="mt-1.5 text-sm text-[var(--muted)] leading-relaxed">{a.detail}</p>
                {a.href && (
                  <Link href={a.href} className="inline-block mt-3 text-sm font-semibold text-[var(--brand)]">
                    Open related page →
                  </Link>
                )}
              </div>
              <div className="shrink-0">
                {a.status === "open" ? (
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={busyId === a.id}
                    onClick={() => confirm(a.id)}
                  >
                    {busyId === a.id ? "Saving…" : "Confirm"}
                  </button>
                ) : (
                  <span className="text-sm font-semibold text-[var(--accent)]">Confirmed</span>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </AppShell>
  );
}
