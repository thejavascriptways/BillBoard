export const BILL_COLUMNS = ["name", "payee", "amount", "dueDate", "property", "category", "frequency", "notes"] as const;
export type BillColumn = (typeof BILL_COLUMNS)[number];

const ALIASES: Record<BillColumn, string[]> = {
  name: ["name", "bill", "description"],
  payee: ["payee", "biller", "vendor", "provider"],
  amount: ["amount", "estimate", "due amount", "payment"],
  dueDate: ["duedate", "due date", "due", "date", "next due"],
  property: ["property", "home", "house"],
  category: ["category", "type"],
  frequency: ["frequency", "recurrence", "repeats"],
  notes: ["notes", "note", "memo"],
};

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (char === "\n") {
      row.push(cell.trim());
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  row.push(cell.trim());
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}

export function guessMapping(headers: string[]): Record<BillColumn, number | null> {
  const normalized = headers.map((header) => header.trim().toLowerCase());
  const mapping = {} as Record<BillColumn, number | null>;
  for (const column of BILL_COLUMNS) {
    const index = normalized.findIndex((header) => ALIASES[column].includes(header));
    mapping[column] = index >= 0 ? index : null;
  }
  return mapping;
}

export function mapBillRows(
  table: string[][],
  mapping: Record<BillColumn, number | null>,
): { name: string; payee: string; amount: string; dueDate: string; property: string; category: string; frequency: string; notes: string }[] {
  const [header, ...body] = table;
  if (!header) return [];
  return body.map((cells) => {
    const read = (column: BillColumn) => {
      const index = mapping[column];
      return index == null ? "" : (cells[index] ?? "").trim();
    };
    return {
      name: read("name"),
      payee: read("payee"),
      amount: read("amount"),
      dueDate: read("dueDate"),
      property: read("property"),
      category: read("category"),
      frequency: read("frequency"),
      notes: read("notes"),
    };
  });
}
