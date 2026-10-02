"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";
import { useSession } from "@/lib/useSession";

export default function SettingsPage() {
  const { user, loading } = useSession();
  const [secret, setSecret] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<string | null>(null);

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
  }

  if (loading || !user) return <div className="min-h-screen grid place-items-center text-[var(--muted)]">Loading…</div>;

  return (
    <AppShell userName={user.name} title="Security" subtitle="Session MFA and encryption posture for the vault.">
      <div className="panel p-6 max-w-xl">
        <p className="text-sm text-[var(--muted)]">
          MFA status: <strong className="text-[var(--ink)]">{user.mfa_enabled ? "Enabled" : "Not enabled"}</strong>. Sensitive fields and CAS PDFs use AES-256-GCM.
        </p>
        {!user.mfa_enabled && (
          <div className="mt-6 space-y-4">
            <button onClick={setup} className="btn-primary">Set up authenticator</button>
            {qr && (
              <div className="rounded-xl border border-[var(--line)] p-4 bg-[var(--bg-soft)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="MFA QR" src={`data:image/png;base64,${qr}`} className="rounded-lg bg-white p-2" />
                <p className="mt-3 text-xs text-[var(--muted)] break-all">Secret: {secret}</p>
                <input className="field mt-3" placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} />
                <button onClick={enable} className="btn-ghost mt-3">Enable MFA</button>
              </div>
            )}
          </div>
        )}
        {status && <p className="mt-4 text-[var(--accent)]">{status}</p>}
      </div>
    </AppShell>
  );
}
