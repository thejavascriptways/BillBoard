export type HomeChoice = { id: string; sortOrder: number; isActive: boolean };

/** Last chosen home id, otherwise the first active home in sort order. */
export function defaultHomeId(homes: HomeChoice[], saved: string | null | undefined): string {
  if (saved === "all") return "all";
  if (saved && homes.some((home) => home.id === saved)) return saved;
  const active = homes.filter((home) => home.isActive).sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  return active[0]?.id ?? homes[0]?.id ?? "all";
}
