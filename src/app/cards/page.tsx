import type { Metadata } from "next";

import { CardBoard } from "@/components/card-board";

export const metadata: Metadata = { title: "Credit cards" };

export default function CardsPage() {
  return <CardBoard />;
}
