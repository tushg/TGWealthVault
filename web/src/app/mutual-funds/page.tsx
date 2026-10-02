"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { api, ApiError, User } from "@/lib/api";

function PlaceholderPage({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    api.me()
      .then((me) => setUser(me.user))
      .catch((err) => {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) router.replace("/login");
      });
  }, [router]);

  if (!user) return <div className="min-h-screen grid place-items-center text-[var(--muted)]">Loading…</div>;

  return (
    <AppShell userName={user.name}>
      <h1 className="text-4xl text-[var(--accent-strong)]" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>
        {title}
      </h1>
      <p className="mt-3 max-w-2xl text-[var(--muted)]">{body}</p>
    </AppShell>
  );
}

export default function MutualFundsPage() {
  return (
    <PlaceholderPage
      title="Mutual Funds"
      body="CAMS / KFin PDF upload and folio parsing come next. Holdings API is already wired on the Go backend."
    />
  );
}
