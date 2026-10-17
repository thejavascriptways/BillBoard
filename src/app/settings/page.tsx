import type { Metadata } from "next";

import { DesktopSettings } from "@/components/desktop-settings";
import { SettingsPanel } from "@/components/settings-panel";

export const metadata: Metadata = {
  title: "Settings",
};

export default function SettingsPage() {
  return (
    <div className="grid gap-6">
      <DesktopSettings />
      <SettingsPanel />
    </div>
  );
}
