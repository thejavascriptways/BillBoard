import type { Metadata } from "next";
import Link from "next/link";

import { DataSettings } from "@/components/data-settings";
import { DesktopSettings } from "@/components/desktop-settings";
import { HouseholdSettings } from "@/components/household-settings";

export const metadata: Metadata = {
  title: "Settings",
};

export default function SettingsPage() {
  return (
    <div className="grid gap-6">
      <p className="text-sm text-muted-foreground">
        Homes, utility types, categories, providers, and the other lists live in{" "}
        <Link href="/configuration" className="font-medium text-primary">Configuration</Link>.
      </p>
      <DataSettings />
      <HouseholdSettings />
      <DesktopSettings />
    </div>
  );
}
