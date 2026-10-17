const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;
export const MAX_AMOUNT_CENTS = 999_999_999;

export function toCents(amount: string): number {
  const [dollars, fraction = ""] = amount.split(".");
  const cents = Number((fraction + "00").slice(0, 2));
  return Number(dollars) * 100 + cents;
}

export function fromCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(Math.trunc(cents));
  return `${sign}${Math.trunc(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

export function parseAmountInput(input: unknown): { cents: number } | { error: string } {
  const raw =
    typeof input === "number"
      ? Number.isFinite(input)
        ? String(input)
        : ""
      : typeof input === "string"
        ? input
        : "";
  const normalized = raw.trim().replace(/[$,\s]/g, "");
  if (!AMOUNT_PATTERN.test(normalized)) {
    return { error: "Enter a dollar amount with up to two decimals." };
  }
  const cents = toCents(normalized);
  if (cents <= 0) return { error: "Enter an amount greater than zero." };
  if (cents > MAX_AMOUNT_CENTS) return { error: "Amount is too large." };
  return { cents };
}

export function formatMoney(amount: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(amount));
}
