import { addDays, compareIso } from "@/lib/dates";

export type ReminderKind = "lead" | "due" | "overdue" | "digest" | "enter_amount" | "verify" | "month_start" | "month_end";

export type ReminderCandidate = {
  occurrenceId: string;
  billId: string;
  billName: string;
  propertyName: string;
  dueDate: string;
  open: boolean;
  offsets: number[];
  snoozedUntil: string | null;
  sentKeys: string[];
  muted?: boolean;
  excluded?: boolean;
  variable?: boolean;
  amountBlank?: boolean;
  autopay?: boolean;
};

export type PlannedReminder = {
  dedupeKey: string;
  occurrenceId: string | null;
  billId: string | null;
  kind: ReminderKind;
  offsetDays: number;
  title: string;
  body: string;
};

function key(parts: Array<string | number | null>): string {
  return parts.join(":");
}

export function inQuietHours(minutesNow: number, quietStart: number, quietEnd: number): boolean {
  if (quietStart === quietEnd) return false;
  if (quietStart < quietEnd) return minutesNow >= quietStart && minutesNow < quietEnd;
  return minutesNow >= quietStart || minutesNow < quietEnd;
}

export function planReminders(input: {
  today: string;
  minutesNow: number;
  digestHour: number;
  digestMinute: number;
  digestSent: boolean;
  occurrences: ReminderCandidate[];
  quietStart?: number;
  quietEnd?: number;
  catchUpDays?: number;
  monthStartSent?: boolean;
  monthEndSent?: boolean;
}): PlannedReminder[] {
  if (
    input.quietStart != null &&
    input.quietEnd != null &&
    inQuietHours(input.minutesNow, input.quietStart, input.quietEnd)
  ) {
    return [];
  }
  const planned: PlannedReminder[] = [];
  let overdue = 0;
  let dueToday = 0;
  let dueSoon = 0;
  const catchUp = input.catchUpDays ?? 0;
  const earliest = addDays(input.today, -catchUp);

  for (const occurrence of input.occurrences) {
    if (!occurrence.open || occurrence.muted || occurrence.excluded) continue;
    if (occurrence.snoozedUntil && compareIso(input.today, occurrence.snoozedUntil) < 0) continue;
    const offsets = occurrence.offsets.length > 0 ? occurrence.offsets : [7, 3, 1, 0];
    if (compareIso(occurrence.dueDate, input.today) < 0) overdue += 1;
    else if (occurrence.dueDate === input.today) dueToday += 1;
    else if (compareIso(occurrence.dueDate, addDays(input.today, 7)) <= 0) dueSoon += 1;

    for (const offset of offsets) {
      if (offset < 0) continue;
      const trigger = addDays(occurrence.dueDate, -offset);
      if (compareIso(trigger, input.today) > 0 || compareIso(trigger, earliest) < 0) continue;
      const kind: ReminderKind = offset === 0 ? "due" : occurrence.variable && occurrence.amountBlank ? "enter_amount" : "lead";
      const dedupeKey = key([occurrence.occurrenceId, kind, offset]);
      if (occurrence.sentKeys.includes(dedupeKey)) continue;
      const when = offset === 0 ? "due today" : offset === 1 ? "due tomorrow" : `due in ${offset} days`;
      planned.push({
        dedupeKey,
        occurrenceId: occurrence.occurrenceId,
        billId: occurrence.billId,
        kind,
        offsetDays: offset,
        title: `${occurrence.propertyName}: ${occurrence.billName}`,
        body:
          kind === "enter_amount"
            ? `Enter this month's amount for ${occurrence.billName}.`
            : `${occurrence.billName} is ${when} (${occurrence.dueDate}).`,
      });
    }

    if (occurrence.autopay) {
      for (const after of [1, 2]) {
        const trigger = addDays(occurrence.dueDate, after);
        if (compareIso(trigger, input.today) > 0 || compareIso(trigger, earliest) < 0) continue;
        const dedupeKey = key([occurrence.occurrenceId, "verify", after]);
        if (occurrence.sentKeys.includes(dedupeKey)) continue;
        planned.push({
          dedupeKey,
          occurrenceId: occurrence.occurrenceId,
          billId: occurrence.billId,
          kind: "verify",
          offsetDays: after,
          title: `${occurrence.propertyName}: confirm ${occurrence.billName}`,
          body: `Autopay for ${occurrence.billName} was expected on ${occurrence.dueDate}. Confirm it posted.`,
        });
      }
    }

    if (compareIso(occurrence.dueDate, input.today) < 0) {
      const dedupeKey = key([occurrence.occurrenceId, "overdue", input.today]);
      if (!occurrence.sentKeys.includes(dedupeKey)) {
        planned.push({
          dedupeKey,
          occurrenceId: occurrence.occurrenceId,
          billId: occurrence.billId,
          kind: "overdue",
          offsetDays: 0,
          title: `${occurrence.propertyName}: ${occurrence.billName} is overdue`,
          body: `${occurrence.billName} was due ${occurrence.dueDate}.`,
        });
      }
    }
  }

  const digestAt = input.digestHour * 60 + input.digestMinute;
  if (!input.digestSent && input.minutesNow >= digestAt) {
    planned.push({
      dedupeKey: key(["digest", input.today]),
      occurrenceId: null,
      billId: null,
      kind: "digest",
      offsetDays: 0,
      title: "BillBoard daily summary",
      body: `${overdue} overdue, ${dueToday} due today, ${dueSoon} due in the next 7 days.`,
    });
  }

  if (input.today.endsWith("-01") && !input.monthStartSent) {
    planned.push({
      dedupeKey: key(["month_start", input.today]),
      occurrenceId: null,
      billId: null,
      kind: "month_start",
      offsetDays: 0,
      title: "BillBoard month started",
      body: "This month's checklist is ready. Variable bills still need an amount.",
    });
  }
  const [year, month, day] = input.today.split("-").map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day === last && !input.monthEndSent) {
    planned.push({
      dedupeKey: key(["month_end", input.today]),
      occurrenceId: null,
      billId: null,
      kind: "month_end",
      offsetDays: 0,
      title: "BillBoard end-of-month review",
      body: `${overdue + dueToday} bill${overdue + dueToday === 1 ? "" : "s"} still open this month.`,
    });
  }

  return planned;
}
