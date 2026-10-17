"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, CreditCard, LayoutGrid, List, Plus, Receipt, Settings } from "lucide-react";
import { useEffect } from "react";

import { BillboardLogo } from "@/components/billboard-logo";
import { PropertyScopeProvider, PropertySwitcher } from "@/components/property-scope";
import { APP_NAME } from "@/lib/constants";
import { cn } from "cn";

const LINKS = [
  { href: "/", label: "Due", icon: LayoutGrid },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/bills", label: "Bills", icon: List },
  { href: "/cards", label: "Cards", icon: CreditCard },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/spending", label: "Spending", icon: Receipt },
  { href: "/settings", label: "Settings", icon: Settings },
];

const MOBILE = LINKS.filter((link) => link.href !== "/expenses" && link.href !== "/spending");

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        router.push("/bills/new");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <PropertyScopeProvider>
      <div className="min-h-dvh bg-background text-foreground">
        <div className="mx-auto grid min-h-dvh w-full max-w-6xl md:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-card px-4 py-6 md:flex">
            <Link href="/" className="flex items-center gap-3 px-1">
              <BillboardLogo className="size-11" />
              <span className="font-display text-3xl leading-none tracking-tight">{APP_NAME}</span>
            </Link>
            <p className="mt-3 px-1 text-sm text-muted-foreground">Due dates for the household.</p>
            <nav className="mt-8 grid gap-1" aria-label="Primary">
              {LINKS.map((link) => {
                const active = isActive(pathname, link.href);
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium",
                      active ? "bg-brand text-white" : "hover:bg-muted",
                    )}
                  >
                    <Icon className="size-4" />
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </aside>
          <div className="flex min-w-0 flex-col">
            <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 bg-brand px-4 py-3 text-white md:px-8">
              <Link href="/" className="flex items-center gap-2.5 md:hidden">
                <BillboardLogo className="size-9 rounded-[22%] ring-2 ring-white" />
                <span className="font-display text-[1.7rem] leading-none tracking-tight">{APP_NAME}</span>
              </Link>
              <p className="hidden text-sm md:block">This month</p>
              <div className="ml-auto flex items-center gap-2">
                <PropertySwitcher />
                <Link
                  href="/bills/new"
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-coral px-3 text-sm font-semibold text-coral-foreground"
                >
                  <Plus className="size-4" />
                  Quick add bill
                </Link>
              </div>
            </header>
            <main className="flex-1 px-4 pt-5 pb-28 md:px-8 md:pt-8 md:pb-16">{children}</main>
          </div>
        </div>
        <nav
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card text-foreground md:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          aria-label="Primary"
        >
          <ul className="grid grid-cols-5">
            {MOBILE.map((link) => {
              const active = isActive(pathname, link.href);
              const Icon = link.icon;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                      active ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    <Icon className="size-5" />
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </PropertyScopeProvider>
  );
}
