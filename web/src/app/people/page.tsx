"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { api, ApiError, User } from "@/lib/api";

export default function PeoplePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    api.me().then((m) => setUser(m.user)).catch((e) => {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) router.replace("/login");
    });
  }, [router]);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await api.createPerson(String(fd.get("name")), String(fd.get("relation") || "") || undefined);
    setMsg("Person added.");
    e.currentTarget.reset();
  }

  if (!user) return <div className="min-h-screen grid place-items-center text-[var(--muted)]">Loading…</div>;

  return (
    <AppShell userName={user.name}>
      <h1 className="text-4xl text-[var(--accent-strong)] mb-6" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>People</h1>
      <form onSubmit={onCreate} className="flex flex-wrap gap-3 max-w-xl">
        <input name="name" required placeholder="Name" className="flex-1 rounded-xl border border-[var(--line)] bg-black/25 px-3 py-2.5" />
        <input name="relation" placeholder="Relation" className="flex-1 rounded-xl border border-[var(--line)] bg-black/25 px-3 py-2.5" />
        <button className="rounded-xl bg-[var(--accent)] text-[#12160f] font-semibold px-4">Add</button>
      </form>
      {msg && <p className="mt-4 text-[var(--positive)] text-sm">{msg}</p>}
    </AppShell>
  );
}
