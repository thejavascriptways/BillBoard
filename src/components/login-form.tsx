"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { BillboardLogo } from "@/components/billboard-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, api } from "@/lib/api-client";
import { APP_NAME } from "@/lib/constants";
import { safeNextPath } from "@/lib/paths";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      router.push(safeNextPath(searchParams.get("next")));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not sign in.");
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <BillboardLogo className="size-16" />
        <p className="mt-4 text-xs font-medium tracking-[0.18em] text-coral-ink uppercase">Household ledger</p>
        <h1 className="mt-2 font-display text-6xl leading-none tracking-tight">{APP_NAME}</h1>
        <p className="mt-3 text-base text-muted-foreground">
          Log what the household spends, whether it belongs to a home or not.
        </p>
        <form onSubmit={onSubmit} className="mt-8 grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-12! text-base"
              required
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="h-12! text-base" disabled={pending}>
            {pending ? "Checking…" : "Continue"}
          </Button>
        </form>
        <p className="mt-6 text-xs leading-5 text-muted-foreground">
          Private to this household. No bank logins, and only a card nickname plus last 4 if you want to record how you paid.
        </p>
      </div>
    </main>
  );
}
