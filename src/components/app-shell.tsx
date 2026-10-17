"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, List, Plus, Settings } from "lucide-react";

import { BillboardLogo } from "@/components/billboard-logo";
import { APP_NAME } from "@/lib/constants";
import { cn } from "cn";

const LINKS = [
  { href: "/", label: "Board", icon: LayoutGrid },
  { href: "/expenses", label: "Expenses", icon: List },
  { href: "/expenses/new", label: "Add", icon: Plus },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/expenses/new") return pathname === "/expenses/new";
  if (href === "/expenses") return pathname === "/expenses" || (pathname.startsWith("/expenses/") && pathname !== "/expenses/new");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto grid min-h-dvh w-full max-w-6xl md:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-card px-5 py-7 md:flex">
          <Link href="/" className="flex items-center gap-3">
            <BillboardLogo className="size-11" />
            <span className="font-display text-3xl leading-none tracking-tight">{APP_NAME}</span>
          </Link>
          <p className="mt-3 text-sm text-muted-foreground">One ledger for the household.</p>
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
                  {link.label === "Add" ? "Add expense" : link.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <div className="flex min-w-0 flex-col">
          <header className="sticky top-0 z-30 flex items-center bg-brand px-4 py-3 text-white md:px-8">
            <Link href="/" className="flex items-center gap-2.5 md:hidden">
              <BillboardLogo className="size-9 rounded-[22%] ring-2 ring-white" />
              <span className="font-display text-[1.7rem] leading-none tracking-tight">{APP_NAME}</span>
            </Link>
            <p className="hidden text-sm md:block">Household ledger</p>
          </header>
          <main className="flex-1 px-4 pt-5 pb-28 md:px-8 md:pt-8 md:pb-16">{children}</main>
        </div>
      </div>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card text-foreground md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Primary"
      >
        <ul className="grid grid-cols-4">
          {LINKS.map((link) => {
            const active = isActive(pathname, link.href);
            const Icon = link.icon;
            const isAdd = link.href === "/expenses/new";
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                    isAdd
                      ? active
                        ? "text-coral-ink"
                        : "text-muted-foreground"
                      : active
                        ? "text-primary"
                        : "text-muted-foreground",
                  )}
                >
                  {isAdd ? (
                    <span className="-mt-5 flex size-12 items-center justify-center rounded-full bg-coral text-coral-foreground shadow-[0_8px_18px_rgba(194,65,47,0.28)]">
                      <Plus className="size-5" />
                    </span>
                  ) : (
                    <Icon className="size-5" />
                  )}
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
