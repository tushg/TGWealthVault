"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { api, ApiError, User } from "@/lib/api";

export default function CashflowPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    api.me().then((m) => setUser(m.user)).catch((e) => {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) router.replace("/login");
    });
  }, [router]);
  if (!user) return <div className="min-h-screen grid place-items-center text-[var(--muted)]">Loading…</div>;
  return (
    <AppShell userName={user.name}>
      <h1 className="text-4xl text-[var(--accent-strong)]" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>Cashflow</h1>
      <p className="mt-3 text-[var(--muted)] max-w-2xl">Monthly income and expense entries with person tags — create/list endpoints are live on the API.</p>
    </AppShell>
  );
}
