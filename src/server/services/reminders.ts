import { channels } from "@/core/channels";
import { planReminders } from "@/core/reminders";
import { occurrenceStatus } from "@/core/status";
import { addDays, chicagoMinutes, formatIsoDate, parseIsoDate, todayInChicago } from "@/lib/dates";
import { toCents } from "@/lib/money";
import { prisma } from "@/server/db";
import { ServiceError } from "@/server/errors";
import { payOccurrence } from "@/server/services/bills";
import { getHousehold } from "@/server/services/household";
import { getPrefs } from "@/server/services/prefs";

export async function dispatchReminders(now = new Date()) {
  const household = await getHousehold();
  const prefs = await getPrefs();
  const today = todayInChicago(now);
  const desktop = channels.find((channel) => channel.id === "desktop");
  if (!desktop?.enabled) return { overdueCount: 0, notifications: [] };

  const rows = await prisma.occurrence.findMany({
    where: {
      householdId: household.id,
      dueDate: { gte: parseIsoDate(addDays(today, -60)), lte: parseIsoDate(addDays(today, 31)) },
      bill: { archivedAt: null },
    },
    include: { bill: true, property: true, payments: true, reminders: true },
  });

  const occurrences = rows.map((row) => {
    const paid = row.payments.filter((payment) => !payment.undoneAt).reduce((sum, payment) => sum + toCents(payment.amount.toFixed(2)), 0);
    const status = occurrenceStatus({
      dueDate: formatIsoDate(row.dueDate),
      expectedCents: toCents(row.expectedAmount.toFixed(2)),
      paidCents: paid,
      skipped: row.skippedAt != null,
      today,
      dueSoonDays: prefs.dueSoonDays,
      graceDays: row.bill.graceDays,
    });
    return {
      occurrenceId: row.id,
      billId: row.billId,
      billName: row.bill.name,
      propertyName: row.property.name,
      dueDate: formatIsoDate(row.dueDate),
      open: status !== "paid" && status !== "skipped",
      offsets: row.bill.reminderDays.length > 0 ? row.bill.reminderDays : prefs.reminderDays,
      snoozedUntil: row.snoozedUntil ? formatIsoDate(row.snoozedUntil) : null,
      sentKeys: row.reminders.map((reminder) => reminder.dedupeKey),
    };
  });

  const digestSent = Boolean(
    await prisma.reminderDelivery.findUnique({ where: { dedupeKey: `digest:${today}` } }),
  );
  const planned = planReminders({
    today,
    minutesNow: chicagoMinutes(now),
    digestHour: prefs.digestHour,
    digestMinute: prefs.digestMinute,
    digestSent,
    occurrences,
  });

  const notifications = [];
  for (const item of planned) {
    try {
      await prisma.reminderDelivery.create({
        data: {
          householdId: household.id,
          dedupeKey: item.dedupeKey,
          occurrenceId: item.occurrenceId,
          billId: item.billId,
          kind: item.kind,
          offsetDays: item.offsetDays,
          channel: desktop.id,
        },
      });
      notifications.push(item);
    } catch {
      // Unique dedupeKey: this reminder was already claimed.
    }
  }

  const overdueCount = occurrences.filter((row) => row.open && row.dueDate < today).length;
  return { overdueCount, notifications };
}

export async function reminderAction(occurrenceId: string, action: "paid" | "snooze") {
  const household = await getHousehold();
  const row = await prisma.occurrence.findFirst({ where: { id: occurrenceId, householdId: household.id } });
  if (!row) throw new ServiceError("That due date was not found.", 404, "not_found");
  if (action === "snooze") {
    await prisma.occurrence.update({
      where: { id: row.id },
      data: { snoozedUntil: parseIsoDate(addDays(todayInChicago(), 1)) },
    });
    return { ok: true as const };
  }
  await payOccurrence(row.id, { note: "Marked paid from a reminder." });
  return { ok: true as const };
}
