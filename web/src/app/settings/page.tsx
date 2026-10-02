"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { api, ApiError, User } from "@/lib/api";

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    api.me().then((m) => setUser(m.user)).catch((e) => {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) router.replace("/login");
    });
  }, [router]);

  async function setup() {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8081"}/api/v1/auth/mfa/setup`, {
      method: "POST",
      credentials: "include",
    });
    const body = await res.json();
    setSecret(body.secret);
    setQr(body.qr_png_b64);
  }

  async function enable() {
    await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8081"}/api/v1/auth/mfa/enable`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    setStatus("MFA enabled.");
    const me = await api.me();
    setUser(me.user);
  }

  if (!user) return <div className="min-h-screen grid place-items-center text-[var(--muted)]">Loading…</div>;

  return (
    <AppShell userName={user.name}>
      <h1 className="text-4xl text-[var(--accent-strong)]" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>Security</h1>
      <p className="mt-3 text-[var(--muted)] max-w-xl">
        MFA status: {user.mfa_enabled ? "Enabled" : "Not enabled"}. Sensitive fields use AES-256-GCM on the Go API.
      </p>

      {!user.mfa_enabled && (
        <div className="mt-8 space-y-4 max-w-md">
          <button onClick={setup} className="rounded-xl bg-[var(--accent)] text-[#12160f] font-semibold px-4 py-2.5">
            Set up authenticator
          </button>
          {qr && (
            <div className="rounded-[var(--radius)] border border-[var(--line)] p-4 bg-[rgba(22,32,28,0.55)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="MFA QR" src={`data:image/png;base64,${qr}`} className="rounded-lg bg-white p-2" />
              <p className="mt-3 text-xs text-[var(--muted)] break-all">Secret: {secret}</p>
              <input
                className="mt-3 w-full rounded-xl border border-[var(--line)] bg-black/25 px-3 py-2.5"
                placeholder="6-digit code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <button onClick={enable} className="mt-3 rounded-xl border border-[var(--line)] px-4 py-2 text-sm">
                Enable MFA
              </button>
            </div>
          )}
        </div>
      )}
      {status && <p className="mt-4 text-[var(--positive)]">{status}</p>}
    </AppShell>
  );
}
