import type { Frequency, IntervalUnit } from "@/core/recurrence";

export type DueRuleKind =
  | "schedule"
  | "day_of_month"
  | "last_day"
  | "last_business_day"
  | "every_n_months"
  | "quarterly"
  | "semiannual"
  | "annual"
  | "fixed_range"
  | "usage"
  | "balance"
  | "on_demand"
  | "event"
  | "statement";

export type PaymentMode = "auto" | "manual" | "check" | "paycheck" | "covered";

export type ParsedDueOn = {
  dueRuleKind: DueRuleKind;
  frequency: Frequency;
  dayOfMonth: number | null;
  interval: number;
  unit: IntervalUnit;
  paymentMode: PaymentMode | null;
  autopay: boolean;
  sessionEveryN: number | null;
  note: string;
};

const UNSCHEDULED = new Set<DueRuleKind>(["usage", "balance", "on_demand", "event", "statement"]);

export function remindersEnabled(kind: DueRuleKind): boolean {
  return !UNSCHEDULED.has(kind);
}

function modeFrom(lower: string): { mode: PaymentMode | null; autopay: boolean } {
  if (/\bauto[\s-]?paid\b|\bautopay\b|\bauto-pay\b/.test(lower)) return { mode: "auto", autopay: true };
  if (/\bpaycheck\b/.test(lower)) return { mode: "paycheck", autopay: false };
  if (/\bby check\b|\bcheck\b/.test(lower)) return { mode: "check", autopay: false };
  if (/\bpaid with\b|\bincluded in\b|\bpaid through\b/.test(lower)) return { mode: "covered", autopay: false };
  if (/\bmanual\b/.test(lower)) return { mode: "manual", autopay: false };
  return { mode: null, autopay: false };
}

/** Turn a spreadsheet "Due on" cell into a structured rule. The original text stays on `note`. */
export function parseDueOn(text: string): ParsedDueOn {
  const note = text.trim();
  const lower = note.toLowerCase().replace(/\s+/g, " ");
  const mode = modeFrom(lower);
  const base: ParsedDueOn = {
    note,
    paymentMode: mode.mode,
    autopay: mode.autopay,
    sessionEveryN: null,
    interval: 1,
    unit: "months",
    dayOfMonth: null,
    frequency: "monthly",
    dueRuleKind: "schedule",
  };
  if (!lower) return base;

  if (/\blast business day\b/.test(lower)) {
    return { ...base, dueRuleKind: "last_business_day", frequency: "monthly", dayOfMonth: -2 };
  }
  if (/\blast day\b/.test(lower)) {
    return { ...base, dueRuleKind: "last_day", frequency: "monthly", dayOfMonth: -1 };
  }
  const ordinal = lower.match(/(\d{1,2})(?:st|nd|rd|th)?\s+of\s+every\s+month/);
  if (ordinal) {
    const day = Number(ordinal[1]);
    return { ...base, dueRuleKind: "day_of_month", frequency: "monthly", dayOfMonth: day >= 1 && day <= 31 ? day : null };
  }
  if (/\bon demand\b/.test(lower)) return { ...base, dueRuleKind: "on_demand", frequency: "once" };
  if (/\bevent[-\s]?based\b/.test(lower)) return { ...base, dueRuleKind: "event", frequency: "once" };
  if (/\blow balance\b|\bon balance\b/.test(lower)) return { ...base, dueRuleKind: "balance", frequency: "once" };
  if (/\bbill due date\b/.test(lower)) return { ...base, dueRuleKind: "statement", frequency: "monthly" };
  const classes = lower.match(/every\s+(\d+)\s+(?:class|classes|session|sessions)/);
  if (classes) return { ...base, dueRuleKind: "usage", frequency: "once", sessionEveryN: Number(classes[1]) };
  if (/\bquarterly\b|\bevery quarter\b/.test(lower)) return { ...base, dueRuleKind: "quarterly", frequency: "quarterly" };
  if (/\bsemi-?annual\b|\btwice a year\b/.test(lower)) return { ...base, dueRuleKind: "semiannual", frequency: "semiannual" };
  if (/\bannually\b|\bannual\b|\byearly\b|\bevery year\b/.test(lower)) {
    return { ...base, dueRuleKind: "annual", frequency: "annual" };
  }
  const everyMonths = lower.match(/every\s+(\d+)\s+months?/);
  if (everyMonths) {
    return {
      ...base,
      dueRuleKind: "every_n_months",
      frequency: "every_n",
      interval: Number(everyMonths[1]),
      unit: "months",
    };
  }
  return base;
}

export function isNonMonthly(kind: DueRuleKind, frequency: string): boolean {
  if (kind === "quarterly" || kind === "semiannual" || kind === "annual" || kind === "every_n_months") return true;
  return frequency === "quarterly" || frequency === "semiannual" || frequency === "annual";
}
