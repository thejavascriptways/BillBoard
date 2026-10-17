import type { WeekendShift } from "@/lib/bill-types";
import type { ReminderPrefsDTO } from "@/lib/bill-types";
import { formatIsoDate, isIsoDate, parseIsoDate } from "@/lib/dates";
import { prisma } from "@/server/db";
import { fieldError } from "@/server/errors";
import { getHousehold } from "@/server/services/household";

const SHIFTS = ["none", "earlier", "later"] as const;

function clampMinutes(value: number | undefined, fallback: number): number {
  if (value == null || Number.isNaN(value)) return fallback;
  return Math.min(24 * 60 - 1, Math.max(0, Math.trunc(value)));
}

export async function getPrefs() {
  const household = await getHousehold();
  return prisma.householdPrefs.upsert({
    where: { householdId: household.id },
    create: { householdId: household.id },
    update: {},
  });
}

export function toPrefsDTO(prefs: {
  reminderDays: number[];
  digestHour: number;
  digestMinute: number;
  dueSoonDays: number;
  backupDir: string | null;
  autoBackup: boolean;
  retention: number;
  shiftWeekends: WeekendShift;
  lastBackupOn: Date | null;
  quietStart: number;
  quietEnd: number;
}): ReminderPrefsDTO {
  return {
    reminderDays: prefs.reminderDays,
    digestHour: prefs.digestHour,
    digestMinute: prefs.digestMinute,
    dueSoonDays: prefs.dueSoonDays,
    backupDir: prefs.backupDir,
    autoBackup: prefs.autoBackup,
    retention: prefs.retention,
    shiftWeekends: prefs.shiftWeekends,
    lastBackupOn: prefs.lastBackupOn ? formatIsoDate(prefs.lastBackupOn) : null,
    quietStart: prefs.quietStart,
    quietEnd: prefs.quietEnd,
  };
}

export async function updatePrefs(input: Partial<ReminderPrefsDTO>): Promise<ReminderPrefsDTO> {
  const current = await getPrefs();
  const reminderDays = input.reminderDays
    ? [...new Set(input.reminderDays.map((day) => Math.trunc(day)))].filter((day) => day >= 0 && day <= 90).sort((a, b) => b - a)
    : current.reminderDays;
  if (reminderDays.length === 0) throw fieldError("reminderDays", "Keep at least one reminder day.");
  const digestHour = input.digestHour ?? current.digestHour;
  const digestMinute = input.digestMinute ?? current.digestMinute;
  if (digestHour < 0 || digestHour > 23 || digestMinute < 0 || digestMinute > 59) {
    throw fieldError("digestHour", "Use a time from 12:00 AM to 11:59 PM.");
  }
  const dueSoonDays = input.dueSoonDays ?? current.dueSoonDays;
  if (dueSoonDays < 1 || dueSoonDays > 30) throw fieldError("dueSoonDays", "Due soon is 1 to 30 days.");
  const retention = input.retention ?? current.retention;
  if (retention < 1 || retention > 90) throw fieldError("retention", "Keep between 1 and 90 backups.");
  const shift = input.shiftWeekends ?? current.shiftWeekends;
  if (!(SHIFTS as readonly string[]).includes(shift)) throw fieldError("shiftWeekends", "Choose a weekend rule.");
  let lastBackupOn = current.lastBackupOn;
  if (input.lastBackupOn) {
    if (!isIsoDate(input.lastBackupOn)) throw fieldError("lastBackupOn", "Use a real date.");
    lastBackupOn = parseIsoDate(input.lastBackupOn);
  }
  const saved = await prisma.householdPrefs.update({
    where: { householdId: current.householdId },
    data: {
      reminderDays,
      digestHour,
      digestMinute,
      dueSoonDays,
      backupDir: input.backupDir === undefined ? current.backupDir : input.backupDir || null,
      autoBackup: input.autoBackup ?? current.autoBackup,
      retention,
      shiftWeekends: shift,
      lastBackupOn,
      quietStart: clampMinutes(input.quietStart, current.quietStart),
      quietEnd: clampMinutes(input.quietEnd, current.quietEnd),
    },
  });
  return toPrefsDTO(saved);
}
