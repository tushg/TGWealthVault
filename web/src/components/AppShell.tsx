"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Landmark,
  PieChart,
  Target,
  Shield,
  Wallet,
  Users,
  LogOut,
  Settings,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/format";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/deposits", label: "FD / RD", icon: Landmark },
  { href: "/mutual-funds", label: "Mutual Funds", icon: PieChart },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/policies", label: "Policies", icon: Shield },
  { href: "/cashflow", label: "Cashflow", icon: Wallet },
  { href: "/people", label: "People", icon: Users },
  { href: "/settings", label: "Security", icon: Settings },
];

export function AppShell({
  children,
  userName,
}: {
  children: React.ReactNode;
  userName?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    try {
      await api.logout();
    } finally {
      router.replace("/login");
    }
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-[var(--line)] lg:border-b-0 lg:border-r lg:min-h-screen bg-[rgba(12,18,16,0.72)] backdrop-blur-xl">
        <div className="px-5 py-6">
          <Link href="/dashboard" className="block">
            <div
              className="text-[1.55rem] leading-none tracking-tight text-[var(--accent-strong)]"
              style={{ fontFamily: "var(--font-display), Georgia, serif" }}
            >
              TGWealthVault
            </div>
            <p className="mt-2 text-xs tracking-[0.18em] uppercase text-[var(--muted)]">
              Family vault
            </p>
          </Link>
        </div>
        <nav className="px-3 pb-4 flex lg:flex-col gap-1 overflow-x-auto">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm whitespace-nowrap transition",
                  active
                    ? "bg-[rgba(196,181,138,0.14)] text-[var(--accent-strong)]"
                    : "text-[var(--muted)] hover:text-[var(--text)] hover:bg-[rgba(255,255,255,0.03)]",
                )}
              >
                <Icon size={16} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="hidden lg:block px-5 py-5 mt-auto border-t border-[var(--line)]">
          <div className="text-sm text-[var(--text)]">{userName || "Signed in"}</div>
          <button
            onClick={logout}
            className="mt-3 inline-flex items-center gap-2 text-sm text-[var(--muted)] hover:text-[var(--danger)]"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>
      <main className="px-4 py-6 sm:px-8 sm:py-8">{children}</main>
    </div>
  );
}
