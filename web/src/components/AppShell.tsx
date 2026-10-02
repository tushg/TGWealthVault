"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BriefcaseBusiness,
  Landmark,
  PieChart,
  Target,
  Shield,
  Wallet,
  Users,
  LogOut,
  Settings,
  Upload,
  Bell,
  ClipboardList,
  ChartColumn,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/format";
import { useEffect, useState } from "react";

const navGroups = [
  {
    label: "Assess",
    items: [
      { href: "/portfolio", label: "Portfolio", icon: BriefcaseBusiness },
      { href: "/alerts", label: "Alerts", icon: Bell, badgeKey: "alerts" as const },
    ],
  },
  {
    label: "Allocate",
    items: [
      { href: "/mutual-funds", label: "Mutual Funds", icon: PieChart },
      { href: "/deposits", label: "Deposits", icon: Landmark },
      { href: "/import", label: "Import CAS", icon: Upload },
    ],
  },
  {
    label: "Plan",
    items: [
      { href: "/goals", label: "Goals", icon: Target },
      { href: "/policies", label: "Protect", icon: Shield },
      { href: "/cashflow", label: "Cashflow", icon: Wallet },
      { href: "/cashflow/budget", label: "Expense Budget", icon: ClipboardList },
      { href: "/cashflow/expense-report", label: "Expense Report", icon: ChartColumn },
    ],
  },
  {
    label: "Family",
    items: [
      { href: "/people", label: "Members", icon: Users },
      { href: "/settings", label: "Security", icon: Settings },
    ],
  },
];

export function AppShell({
  children,
  userName,
  title,
  subtitle,
  actions,
}: {
  children: React.ReactNode;
  userName?: string;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [openAlerts, setOpenAlerts] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.alertSummary()
      .then((s) => {
        if (!cancelled) setOpenAlerts(s.open || 0);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  async function logout() {
    try {
      await api.logout();
    } finally {
      router.replace("/login");
    }
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="bg-[var(--brand-deep)] text-white lg:min-h-screen">
        <div className="px-5 py-6 border-b border-white/10">
          <Link href="/portfolio">
            <div className="text-[1.35rem] leading-none" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>
              TGWealthVault
            </div>
            <p className="mt-2 text-[11px] tracking-[0.16em] uppercase text-white/60">Portfolio Manager</p>
          </Link>
        </div>
        <nav className="px-3 py-4 space-y-5">
          {navGroups.map((group) => (
            <div key={group.label}>
              <div className="px-3 mb-1.5 text-[10px] tracking-[0.18em] uppercase text-white/45">{group.label}</div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active =
                    pathname === item.href ||
                    (item.href !== "/portfolio" &&
                      item.href !== "/cashflow" &&
                      pathname.startsWith(`${item.href}/`));
                  const badge = "badgeKey" in item && item.badgeKey === "alerts" ? openAlerts : 0;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition",
                        active ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/8 hover:text-white",
                      )}
                    >
                      <Icon size={16} />
                      <span className="flex-1">{item.label}</span>
                      {badge > 0 && (
                        <span className="min-w-5 h-5 px-1.5 rounded-full bg-[#e8a45c] text-[#073560] text-[11px] font-bold grid place-items-center">
                          {badge > 99 ? "99+" : badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="hidden lg:block px-5 py-5 mt-8 border-t border-white/10">
          <div className="text-sm">{userName || "Signed in"}</div>
          <button onClick={logout} className="mt-3 inline-flex items-center gap-2 text-sm text-white/65 hover:text-white">
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>

      <div className="min-w-0">
        {(title || actions) && (
          <header className="sticky top-0 z-10 border-b border-[var(--line)] bg-[rgba(247,249,252,0.92)] backdrop-blur px-4 sm:px-8 py-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              {title && (
                <h1 className="text-2xl sm:text-[1.75rem] text-[var(--ink)]" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>
                  {title}
                </h1>
              )}
              {subtitle && <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p>}
            </div>
            {actions}
          </header>
        )}
        <main className="px-4 py-6 sm:px-8 sm:py-7">{children}</main>
      </div>
    </div>
  );
}
