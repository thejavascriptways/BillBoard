export type CardMonthFlags = {
  paidBelowStatement: boolean;
  balanceCarried: boolean;
  zeroBalance: boolean;
};

/** statement and paid are decimal strings. Null means blank, which is not a zero balance. */
export function cardMonthFlags(statement: string | null, paid: string | null): CardMonthFlags {
  if (statement == null) return { paidBelowStatement: false, balanceCarried: false, zeroBalance: false };
  const statementCents = Math.round(Number(statement) * 100);
  const paidCents = paid == null ? null : Math.round(Number(paid) * 100);
  const zeroBalance = statementCents === 0;
  const paidBelowStatement = paidCents != null && paidCents < statementCents;
  return {
    paidBelowStatement,
    balanceCarried: paidBelowStatement && statementCents > 0,
    zeroBalance,
  };
}
