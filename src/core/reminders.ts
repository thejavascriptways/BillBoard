import { addDays, compareIso } from "@/lib/dates";

export type ReminderKind = "lead" | "due" | "overdue" | "digest";

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

export function planReminders(input: {
  today: string;
  minutesNow: number;
  digestHour: number;
  digestMinute: number;
  digestSent: boolean;
  occurrences: ReminderCandidate[];
}): PlannedReminder[] {
  const planned: PlannedReminder[] = [];
  let overdue = 0;
  let dueToday = 0;
  let dueSoon = 0;

  for (const occurrence of input.occurrences) {
    if (!occurrence.open) continue;
    if (occurrence.snoozedUntil && compareIso(input.today, occurrence.snoozedUntil) < 0) continue;
    const offsets = occurrence.offsets.length > 0 ? occurrence.offsets : [3, 1, 0];
    if (compareIso(occurrence.dueDate, input.today) < 0) overdue += 1;
    else if (occurrence.dueDate === input.today) dueToday += 1;
    else if (compareIso(occurrence.dueDate, addDays(input.today, 7)) <= 0) dueSoon += 1;

    for (const offset of offsets) {
      if (offset < 0) continue;
      const trigger = addDays(occurrence.dueDate, -offset);
      if (trigger !== input.today) continue;
      const kind: ReminderKind = offset === 0 ? "due" : "lead";
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
        body: `${occurrence.billName} is ${when} (${occurrence.dueDate}).`,
      });
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

  return planned;
}
