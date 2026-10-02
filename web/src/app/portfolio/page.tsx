"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PortfolioView } from "@/components/PortfolioView";
import { api, PortfolioOverview } from "@/lib/api";
import { useSession } from "@/lib/useSession";

export default function PortfolioPage() {
  const { user, loading, error: sessionError } = useSession();
  const [data, setData] = useState<PortfolioOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    api.portfolio()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [user]);

  if (loading || !user) {
    return <div className="min-h-screen grid place-items-center text-[var(--muted)]">Opening portfolio…</div>;
  }
  if (sessionError || error) {
    return (
      <div className="min-h-screen grid place-items-center text-[var(--danger)] px-6 text-center">
        {sessionError || error}. Is the API on :8081?
      </div>
    );
  }
  if (!data) {
    return <div className="min-h-screen grid place-items-center text-[var(--muted)]">Loading portfolio…</div>;
  }

  return (
    <AppShell
      userName={user.name}
      title="Portfolio"
      subtitle="One desk for net worth, allocation, holdings, and next actions."
      actions={
        <Link href="/import" className="btn-primary">Import CAS</Link>
      }
    >
      <PortfolioView data={data} />
    </AppShell>
  );
}
