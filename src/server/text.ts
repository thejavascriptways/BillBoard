import { ACCOUNT_NUMBER_MESSAGE, hasAccountNumber } from "@/lib/secrets";
import { fieldError } from "@/server/errors";

export function slugify(name: string, fallback: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return base || fallback;
}

export function cleanRequired(field: string, value: string, label: string, max: number): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) throw fieldError(field, `Enter a ${label}.`);
  if (trimmed.length > max) throw fieldError(field, `Use ${max} characters or fewer.`);
  if (hasAccountNumber(trimmed)) throw fieldError(field, ACCOUNT_NUMBER_MESSAGE);
  return trimmed;
}

export function cleanOptional(field: string, value: string | null | undefined, max: number): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) throw fieldError(field, `Use ${max} characters or fewer.`);
  if (hasAccountNumber(trimmed)) throw fieldError(field, ACCOUNT_NUMBER_MESSAGE);
  return trimmed;
}

export function cleanLast4(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/[\s-]/g, "");
  if (/^\d{4}$/.test(digits)) return digits;
  const onlyDigits = trimmed.replace(/\D/g, "");
  if (onlyDigits.length > 4 || hasAccountNumber(trimmed)) {
    throw fieldError("last4", ACCOUNT_NUMBER_MESSAGE);
  }
  throw fieldError("last4", "Enter the last 4 digits, or leave this blank.");
}

export async function uniqueSlug(
  name: string,
  fallback: string,
  taken: (slug: string) => Promise<boolean>,
): Promise<string> {
  const base = slugify(name, fallback);
  let slug = base;
  let n = 2;
  while (await taken(slug)) {
    slug = `${base.slice(0, 44)}-${n}`;
    n += 1;
  }
  return slug;
}
