/**
 * Reject values that look like a full card or account number.
 * A nickname plus last 4 ("Chase ••4421") is allowed. Eight or more
 * consecutive digits, or a 13–19 digit run with spaces or dashes, is not.
 */
export function hasAccountNumber(value: string): boolean {
  if (/\d{8,}/.test(value)) return true;
  const compact = value.replace(/[\s-]/g, "");
  return /\d{13,19}/.test(compact);
}

export const ACCOUNT_NUMBER_MESSAGE =
  "Don't store full account or card numbers. A nickname and last 4 are enough.";
