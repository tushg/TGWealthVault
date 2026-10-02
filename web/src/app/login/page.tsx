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
        router.replace("/portfolio");
        return;
      }
      const res = await api.login(email, password);
      if (res.mfa_pending) setMfaPending(true);
      else router.replace("/portfolio");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_0.9fr]">
      <section className="relative px-8 py-12 lg:px-14 lg:py-16 flex flex-col justify-between bg-[linear-gradient(155deg,#073560_0%,#0a4d8c_50%,#0e6a8f_100%)] text-white overflow-hidden">
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.25), transparent 40%), radial-gradient(circle at 80% 70%, rgba(12,122,84,0.45), transparent 35%)" }} />
        <div className="relative">
          <div className="text-4xl sm:text-5xl" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>TGWealthVault</div>
          <p className="mt-4 max-w-md text-lg text-white/80 leading-relaxed">
            Private portfolio manager for Indian households — CAS imports, deposits, goal missions, and protection tracking.
          </p>
        </div>
        <div className="relative text-sm text-white/65">Invite-only · Encrypted at rest · MFA ready</div>
      </section>

      <section className="flex items-center justify-center px-6 py-12 bg-[var(--bg)]">
        <form onSubmit={onSubmit} className="w-full max-w-md panel p-7">
          <h1 className="text-3xl" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>
            {mfaPending ? "Confirm MFA" : "Sign in"}
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {mfaPending ? "Enter the 6-digit authenticator code." : "Provisioned family accounts only."}
          </p>

          {!mfaPending ? (
            <div className="mt-6 space-y-4">
              <label><span className="label">Email</span><input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
              <label><span className="label">Password</span><input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
            </div>
          ) : (
            <label className="mt-6 block"><span className="label">Authenticator code</span>
              <input className="field tracking-[0.35em]" value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} maxLength={6} required />
            </label>
          )}

          {error && <p className="mt-4 text-sm text-[var(--danger)]">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary mt-6 w-full disabled:opacity-60">
            {loading ? "Please wait…" : mfaPending ? "Verify" : "Enter portfolio"}
          </button>
        </form>
      </section>
    </div>
  );
}
