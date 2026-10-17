export type PropertyDTO = {
  id: string;
  name: string;
  address: string | null;
  notes: string | null;
  kind: "primary" | "rental" | "vacation" | "other";
  status: "active" | "upcoming" | "archived";
  purchaseDate: string | null;
  roleStartsOn: string | null;
  roleBecomes: "primary" | "rental" | "vacation" | "other" | null;
  sortOrder: number;
  archived: boolean;
  expenseCount: number;
};

export type CategoryDTO = {
  id: string;
  name: string;
  sortOrder: number;
  archived: boolean;
  expenseCount: number;
};

export type PaymentMethodDTO = {
  id: string;
  nickname: string;
  last4: string | null;
  label: string;
  sortOrder: number;
  archived: boolean;
  expenseCount: number;
};

export type ExpenseDTO = {
  id: string;
  expenseDate: string;
  propertyId: string;
  propertyName: string;
  categoryId: string;
  categoryName: string;
  payee: string;
  amount: string;
  paymentMethodId: string;
  paymentMethod: string;
  notes: string | null;
  isSample: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ExpenseListDTO = {
  expenses: ExpenseDTO[];
  nextCursor: string | null;
  total: number;
};

export type MoneyByProperty = {
  id: string;
  name: string;
  total: string;
};

export type CategoryTotal = {
  id: string;
  name: string;
  total: string;
  share: number;
};

export type TrendMonth = {
  month: string;
  label: string;
  total: string;
  byProperty: { id: string; total: string }[];
};

export type SummaryDTO = {
  timezone: string;
  currency: "USD";
  asOf: string;
  month: {
    label: string;
    from: string;
    to: string;
    total: string;
    byProperty: MoneyByProperty[];
  };
  yearToDate: {
    label: string;
    from: string;
    to: string;
    total: string;
    byProperty: MoneyByProperty[];
  };
  categories: {
    month: CategoryTotal[];
    yearToDate: CategoryTotal[];
  };
  monthlyTrend: TrendMonth[];
};

export type ExpenseInput = {
  expenseDate: string;
  propertyId: string;
  categoryId: string;
  payee: string;
  amount: string | number;
  paymentMethodId: string;
  notes?: string | null;
};

export type ExpenseQuery = {
  propertyId?: string;
  categoryId?: string;
  from?: string;
  to?: string;
  q?: string;
  cursor?: string;
  limit?: number;
};
