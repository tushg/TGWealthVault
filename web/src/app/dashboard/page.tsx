"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { DashboardView } from "@/components/DashboardView";
import { api, ApiError, DashboardSummary, User } from "@/lib/api";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await api.me();
        if (me.user.mfa_enabled && !me.mfa_verified) {
          router.replace("/login");
          return;
        }
        const dash = await api.dashboard();
        if (!cancelled) {
          setUser(me.user);
          setData(dash);
        }
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          router.replace("/login");
          return;
        }
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (error) {
    return (
      <div className="min-h-screen grid place-items-center text-[var(--danger)] px-6 text-center">
        {error}. Is the Go API running on :8080 and Postgres up?
      </div>
    );
  }

  if (!data || !user) {
    return (
      <div className="min-h-screen grid place-items-center text-[var(--muted)]">
        Opening vault…
      </div>
    );
  }

  return (
    <AppShell userName={user.name}>
      <DashboardView data={data} />
    </AppShell>
  );
}
