import type { Metadata } from "next";

import { ConfigurationBoard } from "@/components/configuration-board";

export const metadata: Metadata = { title: "Configuration" };

export default function ConfigurationPage() {
  return <ConfigurationBoard />;
}
