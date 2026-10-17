"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DesktopStatus } from "@/types/desktop";

export function DesktopSettings() {
  const [status, setStatus] = useState<DesktopStatus | null>(null);
  const [minutes, setMinutes] = useState("10");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const desktop = window.billboardDesktop;
    if (!desktop) return;
    let cancelled = false;
    desktop.status().then((next) => {
      if (cancelled) return;
      setStatus(next);
      setMinutes(String(next.autoLockMinutes));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!status) return null;

  async function save(next: { autoLockMinutes?: number; openAtLogin?: boolean }) {
    const desktop = window.billboardDesktop;
    if (!desktop) return;
    const updated = await desktop.setPreferences(next);
    setStatus(updated);
    setMinutes(String(updated.autoLockMinutes));
    setMessage("Saved on this Mac.");
  }

  return (
    <section className="mx-auto grid w-full max-w-3xl gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
      <div>
        <h2 className="font-medium">This Mac</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          BillBoard locks itself after you step away, when the Mac sleeps, and when the screen locks. Closing the window leaves it in the menu bar.
        </p>
      </div>
      <div className="grid gap-1.5 sm:max-w-xs">
        <Label htmlFor="auto-lock">Auto-lock after (minutes)</Label>
        <Input
          id="auto-lock"
          inputMode="numeric"
          value={minutes}
          onChange={(event) => setMinutes(event.target.value)}
          className="h-12! text-base"
        />
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-[var(--brand-purple)]"
          checked={status.openAtLogin}
          onChange={(event) => void save({ openAtLogin: event.target.checked })}
        />
        Launch BillBoard at login
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="h-11!" onClick={() => void save({ autoLockMinutes: Number(minutes) })}>
          Save auto-lock
        </Button>
        <Button type="button" className="h-11!" onClick={() => window.billboardDesktop?.lock()}>
          Lock now
        </Button>
      </div>
      {message ? <p className="text-sm text-brand-indigo">{message}</p> : null}
    </section>
  );
}
