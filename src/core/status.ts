import { addDays, compareIso } from "@/lib/dates";

export const OCCURRENCE_STATUSES = [
  "upcoming",
  "due_soon",
  "due_today",
  "overdue",
  "partial",
  "paid",
  "skipped",
] as const;

export type OccurrenceStatus = (typeof OCCURRENCE_STATUSES)[number];

export function occurrenceStatus(input: {
  dueDate: string;
  expectedCents: number;
  paidCents: number;
  skipped: boolean;
  today: string;
  dueSoonDays: number;
  graceDays?: number;
}): OccurrenceStatus {
  if (input.skipped) return "skipped";
  if (input.paidCents > 0 && input.paidCents >= input.expectedCents) return "paid";
  if (input.paidCents > 0) return "partial";
  const grace = Math.max(0, input.graceDays ?? 0);
  const overdueOn = addDays(input.dueDate, grace);
  if (compareIso(input.today, overdueOn) > 0) return "overdue";
  if (input.dueDate === input.today) return "due_today";
  const soonUntil = addDays(input.today, Math.max(1, input.dueSoonDays));
  if (compareIso(input.dueDate, soonUntil) <= 0) return "due_soon";
  return "upcoming";
}
