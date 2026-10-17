import { addMonths, compareIso } from "@/lib/dates";

export type CardDates = {
  nextStatement: string;
  nextDue: string;
};

function onOrAfter(today: string, day: number): string {
  const thisMonth = addMonths(today.slice(0, 7) + "-01", 0, day);
  if (compareIso(thisMonth, today) >= 0) return thisMonth;
  return addMonths(today, 1, day);
}

function onOrBefore(today: string, day: number): string {
  const thisMonth = addMonths(today.slice(0, 7) + "-01", 0, day);
  if (compareIso(thisMonth, today) <= 0) return thisMonth;
  return addMonths(today, -1, day);
}

function dueAfterStatement(statement: string, dueDay: number): string {
  const sameMonth = addMonths(statement.slice(0, 7) + "-01", 0, dueDay);
  if (compareIso(sameMonth, statement) > 0) return sameMonth;
  return addMonths(statement, 1, dueDay);
}

/** Nickname, or "Issuer •••• 1234", or "Card •••• 1234". */
export function cardDisplayName(issuer: string, nickname: string, last4: string): string {
  const nick = nickname.trim();
  if (nick) return nick;
  const who = issuer.trim() || "Card";
  return `${who} •••• ${last4}`;
}

export function cardDates(today: string, statementDay: number, dueDay: number): CardDates {
  const statement = onOrBefore(today, statementDay);
  let due = dueAfterStatement(statement, dueDay);
  if (compareIso(due, today) < 0) {
    due = dueAfterStatement(addMonths(statement, 1, statementDay), dueDay);
  }
  return { nextStatement: onOrAfter(today, statementDay), nextDue: due };
}

export function utilizationPercent(balanceCents: number, limitCents: number): number | null {
  if (limitCents <= 0) return null;
  return Math.round((balanceCents / limitCents) * 1000) / 10;
}

export function totalUtilization(
  cards: { balanceCents: number; limitCents: number }[],
): number | null {
  const balance = cards.reduce((sum, card) => sum + card.balanceCents, 0);
  const limit = cards.reduce((sum, card) => sum + Math.max(0, card.limitCents), 0);
  return utilizationPercent(balance, limit);
}
