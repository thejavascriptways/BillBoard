import type { Metadata } from "next";

import { DueBoard } from "@/components/due-board";

export const metadata: Metadata = { title: "Due dates" };

export default function HomePage() {
  return <DueBoard />;
}
