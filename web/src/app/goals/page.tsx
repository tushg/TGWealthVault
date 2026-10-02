"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { api, ApiError, Goal, User } from "@/lib/api";
import { formatINR } from "@/lib/format";

export default function GoalsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [items, setItems] = useState<Goal[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const me = await api.me();
    const list = await api.goals();
    setUser(me.user);
    setItems(list || []);
  }

  useEffect(() => {
    load().catch((err) => {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) router.replace("/login");
      else setError(err instanceof Error ? err.message : "Failed");
    });
  }, [router]);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await api.createGoal({
      name: fd.get("name"),
      target_amount: fd.get("target_amount"),
      current_amount: fd.get("current_amount") || "0",
      category: fd.get("category") || null,
    });
    e.currentTarget.reset();
    await load();
  }

  if (!user) return <div className="min-h-screen grid place-items-center text-[var(--muted)]">Loading…</div>;

  return (
    <AppShell userName={user.name}>
      <h1 className="text-4xl text-[var(--accent-strong)] mb-6" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>
        Goals
      </h1>
      {error && <p className="text-[var(--danger)] mb-4">{error}</p>}

      <form onSubmit={onCreate} className="mb-8 grid gap-3 sm:grid-cols-4 rounded-[var(--radius)] border border-[var(--line)] p-5 bg-[rgba(22,32,28,0.55)]">
        <input name="name" placeholder="Goal name" required className="rounded-xl border border-[var(--line)] bg-black/25 px-3 py-2.5" />
        <input name="target_amount" type="number" placeholder="Target ₹" required className="rounded-xl border border-[var(--line)] bg-black/25 px-3 py-2.5" />
        <input name="current_amount" type="number" placeholder="Saved ₹" className="rounded-xl border border-[var(--line)] bg-black/25 px-3 py-2.5" />
        <button type="submit" className="rounded-xl bg-[var(--accent)] text-[#12160f] font-semibold">Add goal</button>
      </form>

      <div className="grid gap-4 md:grid-cols-2">
        {items.length === 0 && <p className="text-[var(--muted)]">No goals yet.</p>}
        {items.map((g) => {
          const pct = Math.min(100, (Number(g.current_amount) / Math.max(1, Number(g.target_amount))) * 100);
          return (
            <div key={g.id} className="rounded-[var(--radius)] border border-[var(--line)] p-5 bg-[rgba(22,32,28,0.55)]">
              <div className="text-xl text-[var(--accent-strong)]" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>{g.name}</div>
              <div className="mt-2 text-sm text-[var(--muted)]">{formatINR(g.current_amount)} of {formatINR(g.target_amount)}</div>
              <div className="mt-4 h-2 rounded-full bg-black/30 overflow-hidden">
                <div className="h-full bg-[var(--positive)]" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
