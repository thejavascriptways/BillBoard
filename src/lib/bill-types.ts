export type PropertyKind = "primary" | "rental" | "vacation" | "other";
export type PropertyStatus = "active" | "upcoming" | "archived";
export type AmountKind = "fixed" | "variable" | "estimated";
export type BillFrequency =
  | "weekly"
  | "biweekly"
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "annual"
  | "every_n"
  | "once";
export type IntervalUnit = "days" | "weeks" | "months";
export type WeekendShift = "none" | "earlier" | "later";
export type OccurrenceStatus =
  | "upcoming"
  | "due_soon"
  | "due_today"
  | "overdue"
  | "partial"
  | "paid"
  | "skipped";

export type PayeeDTO = {
  id: string;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  accountLast4: string | null;
  website: string | null;
  phone: string | null;
  notes: string | null;
  archived: boolean;
};

export type OccurrenceDTO = {
  id: string;
  billId: string;
  billName: string;
  payeeId: string;
  payeeName: string;
  propertyId: string;
  propertyName: string;
  categoryId: string;
  categoryName: string;
  dueDate: string;
  expectedAmount: string;
  paidAmount: string;
  remaining: string;
  status: OccurrenceStatus;
  autopay: boolean;
  skipped: boolean;
};

export type PaymentDTO = {
  id: string;
  occurrenceId: string;
  billId: string;
  billName: string;
  payeeId: string;
  payeeName: string;
  propertyId: string;
  propertyName: string;
  paidOn: string;
  amount: string;
  paymentMethodId: string | null;
  paymentMethod: string | null;
  confirmationNumber: string | null;
  note: string | null;
  undone: boolean;
};

export type BillDTO = {
  id: string;
  name: string;
  payeeId: string | null;
  payeeName: string;
  propertyId: string;
  propertyName: string;
  categoryId: string;
  categoryName: string;
  amountKind: AmountKind;
  amount: string | null;
  anchorDate: string;
  autopay: boolean;
  paymentMethodId: string | null;
  notes: string | null;
  portalUrl: string | null;
  frequency: BillFrequency;
  interval: number;
  unit: IntervalUnit;
  dayOfMonth: number | null;
  endDate: string | null;
  endCount: number | null;
  shiftWeekends: WeekendShift;
  reminderDays: number[];
  graceDays: number;
  paymentMode: "auto" | "manual" | "check" | "paycheck" | "covered";
  coveredByBillId: string | null;
  dueOnNote: string | null;
  dueRuleKind: string;
  sessionEveryN: number | null;
  sessionCount: number;
  personId: string | null;
  muted: boolean;
  archived: boolean;
  nextDue: string | null;
};

export type CardDTO = {
  id: string;
  propertyId: string;
  propertyName: string;
  billId: string | null;
  issuer: string;
  nickname: string;
  displayName: string;
  last4: string;
  statementDay: number | null;
  dueDay: number | null;
  autopay: boolean;
  cardholderId: string | null;
  cardholderName: string | null;
  statementAmount: string | null;
  amountPaid: string | null;
  paidBelowStatement: boolean;
  balanceCarried: boolean;
  archived: boolean;
  nextStatement: string | null;
  nextDue: string | null;
  utilization: null;
};

export type DueBoardDTO = {
  asOf: string;
  overdue: OccurrenceDTO[];
  dueToday: OccurrenceDTO[];
  next7: OccurrenceDTO[];
  next30: OccurrenceDTO[];
  month: { due: string; paid: string };
  byProperty: { id: string; name: string; due: string; paid: string }[];
  cards: { totalUtilization: number | null; items: CardDTO[] };
};

export type ReminderPrefsDTO = {
  reminderDays: number[];
  digestHour: number;
  digestMinute: number;
  dueSoonDays: number;
  backupDir: string | null;
  autoBackup: boolean;
  retention: number;
  shiftWeekends: WeekendShift;
  lastBackupOn: string | null;
  quietStart: number;
  quietEnd: number;
};
