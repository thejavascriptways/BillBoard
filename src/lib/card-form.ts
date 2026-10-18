/** Last 4 is the only required card field, and it must be exactly four digits. */
export function cardLast4Message(value: string): string | null {
  if (/^\d{4}$/.test(value.trim())) return null;
  return "Enter exactly 4 digits.";
}

/** Blank statement and due days are stored as null. Anything else must be a day of the month. */
export function cardDayValue(value: string): { day: number | null; message: string | null } {
  const trimmed = value.trim();
  if (!trimmed) return { day: null, message: null };
  if (!/^\d{1,2}$/.test(trimmed)) return { day: null, message: "Use a day from 1 to 31, or leave it blank." };
  const day = Number(trimmed);
  if (!Number.isInteger(day) || day < 1 || day > 31) return { day: null, message: "Use a day from 1 to 31, or leave it blank." };
  return { day, message: null };
}

/**
 * A blank property follows the home currently on screen.
 * "All homes" leaves the choice empty so the server can use its default, and the unfiltered list still shows the card.
 */
export function cardPropertyForSave(formPropertyId: string, scopedPropertyId: string): string | null {
  const chosen = formPropertyId.trim();
  if (chosen) return chosen;
  if (scopedPropertyId && scopedPropertyId !== "all") return scopedPropertyId;
  return null;
}
