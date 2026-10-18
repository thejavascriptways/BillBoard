import { Decimal } from "@/server/prisma-types";
import { modelOf } from "@/server/sheet/catalog";
import type { Row } from "@/server/sheet/memory-db";
import { columnsForTab, modelForTab, type Column } from "@/server/sheet/schema";

export type SheetIssue = { tab: string; row: number; problem: string };

export function columnLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export function sheetRange(tab: string, row: number, width: number): string {
  const end = columnLetter(Math.max(width - 1, 0));
  return `'${tab.replaceAll("'", "''")}'!A${row}:${end}${row}`;
}

function cell(value: unknown, column: Column): string {
  if (value == null || value === "") return "";
  if (column.kind === "date" && value instanceof Date) return value.toISOString().slice(0, 10);
  if (column.kind === "datetime" && value instanceof Date) return value.toISOString();
  if (column.kind === "decimal" && value instanceof Decimal) return value.toString();
  if (column.kind === "ints" && Array.isArray(value)) return value.join(",");
  if (column.kind === "bool") return value ? "true" : "false";
  return String(value);
}

export function encodeRow(
  tab: string,
  row: Row,
  version: number,
  deleted: boolean,
  nameOf: (delegate: string, id: unknown) => string,
): string[] {
  return columnsForTab(tab).map((column) => {
    if (column.field === "deleted") return deleted ? "true" : "false";
    if (column.field === "version") return String(version);
    if (column.computed && column.fk && column.target) return nameOf(column.target, row[column.fk]);
    return cell(row[column.field], column);
  });
}

export function headerRow(tab: string): string[] {
  return columnsForTab(tab).map((column) => column.header);
}

function parseCell(column: Column, raw: string): { ok: true; value: unknown } | { ok: false; problem: string } {
  const text = raw ?? "";
  if (!text) return { ok: true, value: null };
  if (column.kind === "bool") return { ok: true, value: text.toLowerCase() === "true" };
  if (column.kind === "int") {
    if (!/^-?\d+$/.test(text)) return { ok: false, problem: `${column.header} is not a whole number.` };
    return { ok: true, value: Number(text) };
  }
  if (column.kind === "decimal") {
    if (Number.isNaN(Number(text))) return { ok: false, problem: `${column.header} is not a number.` };
    return { ok: true, value: new Decimal(text) };
  }
  if (column.kind === "date") {
    if (!/^\d{4}-\d{2}-\d{2}/.test(text)) return { ok: false, problem: `${column.header} is not a date.` };
    return { ok: true, value: new Date(`${text.slice(0, 10)}T00:00:00.000Z`) };
  }
  if (column.kind === "datetime") {
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return { ok: false, problem: `${column.header} is not a time.` };
    return { ok: true, value: date };
  }
  if (column.kind === "ints") {
    if (!text.split(",").every((part) => part.trim() === "" || /^-?\d+$/.test(part.trim()))) {
      return { ok: false, problem: `${column.header} is not a list of numbers.` };
    }
    return { ok: true, value: text.split(",").map((part) => part.trim()).filter(Boolean).map(Number) };
  }
  if (column.kind === "enum" && column.enumValues && !column.enumValues.includes(text)) {
    return { ok: false, problem: `${column.header} has “${text}”, which is not one of ${column.enumValues.join(", ")}.` };
  }
  return { ok: true, value: text };
}

export function decodeRow(
  tab: string,
  values: string[],
  rowNumber: number,
): { ok: true; model: string; row: Row; deleted: boolean; version: number; recordType?: string } | { ok: false; issue: SheetIssue } {
  if (tab === "_meta") return { ok: true, model: "_meta", row: { key: values[0] ?? "", value: values[1] ?? "" }, deleted: false, version: 0 };
  const columns = columnsForTab(tab);
  const row: Row = {};
  let deleted = false;
  let version = 1;
  let recordType = "";
  for (let index = 0; index < columns.length; index += 1) {
    const column = columns[index];
    if (column.computed) continue;
    const raw = values[index] ?? "";
    if (column.field === "deleted") {
      deleted = raw.toLowerCase() === "true";
      continue;
    }
    if (column.field === "version") {
      version = Number(raw) || 1;
      continue;
    }
    if (column.field === "recordType") {
      recordType = raw;
      continue;
    }
    const parsed = parseCell(column, raw);
    if (!parsed.ok) return { ok: false, issue: { tab, row: rowNumber, problem: parsed.problem } };
    if (parsed.value != null) row[column.field] = parsed.value;
  }
  const model = tab === "Settings" ? (recordType === "prefs" ? "householdPrefs" : "household") : modelForTab(tab);
  const pk = model === "householdPrefs" ? "householdId" : "id";
  if (!row[pk]) return { ok: false, issue: { tab, row: rowNumber, problem: "This row has no id." } };
  try {
    modelOf(model);
  } catch {
    return { ok: false, issue: { tab, row: rowNumber, problem: "This tab is not part of the ledger." } };
  }
  return { ok: true, model, row, deleted, version, recordType };
}

export function danglingProblem(model: string, row: Row, exists: (delegate: string, id: unknown) => boolean): string | null {
  const spec = modelOf(model);
  for (const relation of Object.values(spec.relations)) {
    if (relation.kind !== "one" || !relation.fk) continue;
    const id = row[relation.fk];
    if (id == null || id === "") continue;
    if (!exists(relation.model, id)) return `${headerLabelSafe(relation.fk)} points at a missing ${relation.model}.`;
  }
  return null;
}

function headerLabelSafe(field: string): string {
  return field.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}
