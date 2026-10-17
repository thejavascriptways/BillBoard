import { addDays, addMonths, compareIso, weekdayUtc } from "@/lib/dates";

export const FREQUENCIES = [
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "semiannual",
  "annual",
  "every_n",
  "once",
] as const;

export type Frequency = (typeof FREQUENCIES)[number];
export type IntervalUnit = "days" | "weeks" | "months";
export type WeekendShift = "none" | "earlier" | "later";

export type RecurrenceRule = {
  frequency: Frequency;
  interval: number;
  unit: IntervalUnit;
  /** 1–31, or -1 for the last day of the month. */
  dayOfMonth: number | null;
  anchorDate: string;
  endDate: string | null;
  endCount: number | null;
  shift: WeekendShift;
};

const MONTHS: Partial<Record<Frequency, number>> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

export function shiftWeekend(iso: string, shift: WeekendShift): string {
  if (shift === "none") return iso;
  const weekday = weekdayUtc(iso);
  if (weekday === 6) return addDays(iso, shift === "earlier" ? -1 : 2);
  if (weekday === 0) return addDays(iso, shift === "earlier" ? -2 : 1);
  return iso;
}

function rawDate(rule: RecurrenceRule, index: number): string {
  if (index === 0 || rule.frequency === "once") return rule.anchorDate;
  if (rule.frequency === "weekly") return addDays(rule.anchorDate, 7 * index);
  if (rule.frequency === "biweekly") return addDays(rule.anchorDate, 14 * index);
  if (rule.frequency === "every_n") {
    const step = Math.max(1, rule.interval);
    if (rule.unit === "days") return addDays(rule.anchorDate, step * index);
    if (rule.unit === "weeks") return addDays(rule.anchorDate, 7 * step * index);
    return addMonths(rule.anchorDate, step * index, rule.dayOfMonth);
  }
  const months = MONTHS[rule.frequency] ?? 1;
  return addMonths(rule.anchorDate, months * index, rule.dayOfMonth);
}

/** Upcoming due dates for a rule, through `horizon` (inclusive), capped at 500. */
export function generateDueDates(rule: RecurrenceRule, horizon: string): { index: number; dueDate: string }[] {
  const dates: { index: number; dueDate: string }[] = [];
  const count = rule.endCount == null ? 500 : Math.min(500, Math.max(0, rule.endCount));
  for (let index = 0; index < count; index += 1) {
    const raw = rawDate(rule, index);
    if (rule.endDate && compareIso(raw, rule.endDate) > 0) break;
    const pastHorizon = compareIso(raw, horizon) > 0;
    if (pastHorizon && index > 0) break;
    dates.push({ index, dueDate: shiftWeekend(raw, rule.shift) });
    if (rule.frequency === "once" || pastHorizon) break;
  }
  return dates;
}
