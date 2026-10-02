"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@tgwealthvault.local");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaPending, setMfaPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mfaPending) {
        await api.verifyMfa(mfaCode);
        router.replace("/dashboard");
        return;
      }
      const res = await api.login(email, password);
      if (res.mfa_pending) {
        setMfaPending(true);
      } else {
        router.replace("/dashboard");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <section className="relative overflow-hidden px-8 py-12 lg:px-14 lg:py-16 flex flex-col justify-between">
        <div
          className="absolute inset-0 opacity-90"
          style={{
            background:
              "radial-gradient(800px 500px at 20% 20%, rgba(196,181,138,0.22), transparent 60%), radial-gradient(700px 400px at 80% 80%, rgba(61,207,154,0.12), transparent 55%)",
          }}
        />
        <div className="relative">
          <div
            className="text-4xl sm:text-5xl text-[var(--accent-strong)]"
            style={{ fontFamily: "var(--font-display), Georgia, serif" }}
          >
            TGWealthVault
          </div>
          <p className="mt-4 max-w-md text-[var(--muted)] text-lg leading-relaxed">
            A private family vault for Indian deposits, mutual funds, goals, and cashflow —
            secured with encryption and MFA.
          </p>
        </div>
        <div className="relative text-sm text-[var(--muted)]">
          No public signup. Invite-only access.
        </div>
      </section>

      <section className="flex items-center justify-center px-6 py-12 bg-[rgba(10,15,13,0.55)] border-l border-[var(--line)]">
        <form
          onSubmit={onSubmit}
          className="w-full max-w-md rounded-[18px] border border-[var(--line)] bg-[rgba(22,32,28,0.75)] p-7 shadow-[var(--shadow)]"
        >
          <h1
            className="text-3xl text-[var(--accent-strong)]"
            style={{ fontFamily: "var(--font-display), Georgia, serif" }}
          >
            {mfaPending ? "Confirm MFA" : "Sign in"}
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {mfaPending
              ? "Enter the 6-digit code from your authenticator app."
              : "Use your provisioned account credentials."}
          </p>

          {!mfaPending ? (
            <div className="mt-6 space-y-4">
              <label className="block text-sm">
                <span className="text-[var(--muted)]">Email</span>
                <input
                  className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-[rgba(0,0,0,0.25)] px-3 py-2.5 outline-none focus:border-[var(--accent)]"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="username"
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--muted)]">Password</span>
                <input
                  className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-[rgba(0,0,0,0.25)] px-3 py-2.5 outline-none focus:border-[var(--accent)]"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </label>
            </div>
          ) : (
            <label className="mt-6 block text-sm">
              <span className="text-[var(--muted)]">Authenticator code</span>
              <input
                className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-[rgba(0,0,0,0.25)] px-3 py-2.5 tracking-[0.35em] outline-none focus:border-[var(--accent)]"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                required
              />
            </label>
          )}

          {error && <p className="mt-4 text-sm text-[var(--danger)]">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full rounded-xl bg-[var(--accent)] text-[#12160f] font-semibold py-3 hover:bg-[var(--accent-strong)] transition disabled:opacity-60"
          >
            {loading ? "Please wait…" : mfaPending ? "Verify & continue" : "Enter vault"}
          </button>
        </form>
      </section>
    </div>
  );
}
