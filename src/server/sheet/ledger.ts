import { sheetRange, decodeRow, danglingProblem, encodeRow, type SheetIssue } from "@/server/sheet/codec";
import { columnsForTab, modelForTab, SCHEMA_VERSION, tabForRow } from "@/server/sheet/schema";
import { modelOf } from "@/server/sheet/catalog";
import type { SheetBackend, ValueUpdate } from "@/server/sheet/backend";
import { SheetHttpError } from "@/server/sheet/backend";
import { cloneRow, type MemoryDb, type Row } from "@/server/sheet/memory-db";

type Dirty = { delegate: string; id: string; op: "upsert" | "delete"; row: Row };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function retryable(error: unknown): boolean {
  return error instanceof SheetHttpError && (error.status === 429 || error.status >= 500);
}

async function withRetry<T>(run: () => Promise<T>): Promise<T> {
  let wait = 200;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (!retryable(error) || attempt === 4) throw error;
      await sleep(wait);
      wait *= 2;
    }
  }
  throw new Error("Sheet write failed.");
}

function businessHash(row: Row): string {
  const copy: Row = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === "updatedAt" || key === "version" || key === "recordType") continue;
    copy[key] = value instanceof Date ? value.toISOString() : value && typeof value === "object" && "toString" in value ? String(value) : value;
  }
  return JSON.stringify(copy, Object.keys(copy).sort());
}

export class SheetLedger {
  readonly issues: SheetIssue[] = [];
  private readonly dirty = new Map<string, Dirty>();
  private readonly versions = new Map<string, number>();
  private readonly rowIndex = new Map<string, Map<string, number>>();
  private readonly hashes = new Map<string, string>();
  private timer: NodeJS.Timeout | null = null;
  private flushing: Promise<void> | null = null;
  private seenModified = "";
  offline = false;
  suppress = false;

  constructor(
    private readonly db: MemoryDb,
    private readonly backend: SheetBackend,
    private spreadsheetId: string,
  ) {
    this.db.onChange = (delegate, row, op) => {
      if (this.suppress) return;
      const model = modelOf(delegate);
      const id = String(row[model.pk] ?? "");
      if (!id) return;
      this.dirty.set(`${delegate}:${id}`, { delegate, id, op, row: cloneRow(row) });
      this.schedule();
    };
  }

  get pending(): number {
    return this.dirty.size;
  }

  setSpreadsheet(id: string): void {
    this.spreadsheetId = id;
  }

  captureAll(): void {
    for (const [delegate, rows] of Object.entries(this.db.snapshot())) {
      const model = modelOf(delegate);
      for (const row of rows) {
        const id = String(row[model.pk] ?? "");
        if (!id) continue;
        this.dirty.set(`${delegate}:${id}`, { delegate, id, op: "upsert", row: cloneRow(row) });
      }
    }
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush().catch(() => undefined);
    }, 300);
  }

  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.flushing) return this.flushing;
    this.flushing = this.writeDirty().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async writeDirty(): Promise<void> {
    if (!this.backend.online) {
      this.offline = true;
      return;
    }
    const batch = [...this.dirty.values()];
    if (batch.length === 0) return;
    try {
      await withRetry(() => this.applyBatch(batch));
      for (const item of batch) this.dirty.delete(`${item.delegate}:${item.id}`);
      this.offline = false;
      const file = await this.backend.getFile(this.spreadsheetId);
      if (file) this.seenModified = file.modifiedTime;
    } catch (error) {
      if (error instanceof SheetHttpError && (error.status === 503 || error.status >= 500)) this.offline = true;
      throw error;
    }
  }

  private async applyBatch(batch: Dirty[]): Promise<void> {
    const tabs = await this.backend.readTabs(this.spreadsheetId);
    const updates: ValueUpdate[] = [];
    const used = new Map<string, number>();
    for (const item of batch) {
      const tab = this.destination(item);
      const key = rowKey(item.delegate, item.id);
      const nextVersion = item.op === "delete" ? (this.versions.get(key) ?? 1) : (this.versions.get(key) ?? 0) + 1;
      this.versions.set(key, Math.max(nextVersion, 1));
      const values = encodeRow(tab, this.payload(item), this.versions.get(key) ?? 1, item.op === "delete", (delegate, id) => this.nameOf(delegate, id));
      let rowNumber = this.locate(tabs, tab, item.delegate, item.id);
      if (!rowNumber) {
        const sheet = tabs.find((entry) => entry.title === tab);
        const length = Math.max(sheet?.rows.length ?? 1, used.get(tab) ?? 1);
        rowNumber = length + 1;
        used.set(tab, rowNumber);
        if (sheet) {
          while (sheet.rows.length < rowNumber) sheet.rows.push([]);
          const columns = columnsForTab(tab);
          const idColumn = item.delegate === "householdPrefs" ? columns.findIndex((column) => column.field === "householdId") : columns.findIndex((column) => column.field === "id");
          const placeholder = sheet.rows[rowNumber - 1] ?? [];
          placeholder[Math.max(idColumn, 0)] = item.id;
          const recordType = columns.findIndex((column) => column.field === "recordType");
          if (recordType >= 0) placeholder[recordType] = item.delegate === "householdPrefs" ? "prefs" : "household";
          sheet.rows[rowNumber - 1] = placeholder;
        }
        let map = this.rowIndex.get(tab);
        if (!map) {
          map = new Map();
          this.rowIndex.set(tab, map);
        }
        map.set(rowKey(item.delegate, item.id), rowNumber);
      }
      updates.push({ range: sheetRange(tab, rowNumber, values.length), values: [values] });
      this.hashes.set(key, businessHash(item.row));
    }
    await this.backend.writeValues(this.spreadsheetId, updates);
  }

  private locate(tabs: { title: string; rows: string[][] }[], tab: string, delegate: string, id: string): number | null {
    const key = rowKey(delegate, id);
    const known = this.rowIndex.get(tab)?.get(key);
    const sheet = tabs.find((item) => item.title === tab);
    const matches = (rowNumber: number) => (sheet ? rowMatches(sheet.rows[rowNumber - 1] ?? [], tab, delegate, id) : false);
    if (known && matches(known)) return known;
    this.rowIndex.get(tab)?.delete(key);
    if (!sheet) return null;
    for (let index = 1; index < sheet.rows.length; index += 1) {
      if (!rowMatches(sheet.rows[index] ?? [], tab, delegate, id)) continue;
      let map = this.rowIndex.get(tab);
      if (!map) {
        map = new Map();
        this.rowIndex.set(tab, map);
      }
      map.set(key, index + 1);
      return index + 1;
    }
    return null;
  }

  private payload(item: Dirty): Row {
    if (item.delegate === "household") return { ...item.row, recordType: "household" };
    if (item.delegate === "householdPrefs") return { ...item.row, recordType: "prefs", id: item.row.householdId };
    return item.row;
  }

  private destination(item: Dirty): string {
    if (item.delegate === "monthEntry") {
      const card = this.db.rows("creditCard").find((row) => String(row.billId ?? "") === String(item.row.billId ?? ""));
      return card ? "CardMonths" : "BillMonths";
    }
    return tabForRow(item.delegate, item.row, (delegate, id) => {
      if (delegate === "__cards_for_bill") {
        return this.db.rows("creditCard").find((row) => String(row.billId ?? "") === String(id ?? "")) ?? null;
      }
      return this.db.rows(delegate).find((row) => String(row[modelOf(delegate).pk]) === String(id ?? "")) ?? null;
    });
  }

  private nameOf(delegate: string, id: unknown): string {
    if (id == null || id === "") return "";
    const model = modelOf(delegate);
    const row = this.db.rows(delegate).find((item) => String(item[model.pk]) === String(id));
    if (!row) return "";
    return String(row.name ?? row.nickname ?? row.label ?? row.slug ?? "");
  }

  async reload(): Promise<void> {
    const tabs = await this.backend.readTabs(this.spreadsheetId);
    const file = await this.backend.getFile(this.spreadsheetId);
    if (file) this.seenModified = file.modifiedTime;
    this.issues.length = 0;
    this.rowIndex.clear();
    const incoming = new Map<string, Row[]>();
    const versions = new Map<string, number>();
    const hashes = new Map<string, string>();
    const decoded: { model: string; row: Row; tab: string; sheetRow: number; version: number }[] = [];
    for (const tab of tabs) {
      if (tab.title === "_meta") continue;
      for (let index = 1; index < tab.rows.length; index += 1) {
        const values = tab.rows[index] ?? [];
        if (values.every((cell) => !String(cell ?? "").trim())) continue;
        const result = decodeRow(tab.title, values, index + 1);
        if (!result.ok) {
          this.issues.push(result.issue);
          continue;
        }
        if (result.model === "_meta" || result.deleted) continue;
        const id = String(result.row[result.model === "householdPrefs" ? "householdId" : "id"]);
        let map = this.rowIndex.get(tab.title);
        if (!map) {
          map = new Map();
          this.rowIndex.set(tab.title, map);
        }
        map.set(rowKey(result.model, id), index + 1);
        decoded.push({ model: result.model, row: result.row, tab: tab.title, sheetRow: index + 1, version: result.version });
        versions.set(rowKey(result.model, id), result.version);
      }
    }
    const exists = (delegate: string, id: unknown) =>
      decoded.some((item) => item.model === delegate && String(item.row[modelOf(delegate).pk]) === String(id));
    for (const item of decoded) {
      const problem = danglingProblem(item.model, item.row, exists);
      if (problem) {
        this.issues.push({ tab: item.tab, row: item.sheetRow, problem });
        continue;
      }
      const list = incoming.get(item.model) ?? [];
      list.push(item.row);
      incoming.set(item.model, list);
      const id = String(item.row[modelOf(item.model).pk]);
      hashes.set(rowKey(item.model, id), businessHash(item.row));
    }
    this.suppress = true;
    try {
      for (const [delegate, rows] of incoming) {
        const kept: Row[] = [];
        for (const row of rows) {
          const model = modelOf(delegate);
          const id = String(row[model.pk]);
          const local = this.dirty.get(`${delegate}:${id}`);
          if (local?.op === "upsert" && timeOf(local.row.updatedAt) > timeOf(row.updatedAt)) {
            kept.push(local.row);
            continue;
          }
          if (local) this.dirty.delete(`${delegate}:${id}`);
          kept.push(row);
        }
        const dirtyLocals = [...this.dirty.values()].filter((item) => item.delegate === delegate && item.op === "upsert");
        for (const local of dirtyLocals) {
          if (!kept.some((row) => String(row[modelOf(delegate).pk]) === local.id)) kept.push(local.row);
        }
        this.db.replaceRows(delegate, kept);
      }
      const seen = modelsOnSheet(tabs);
      for (const delegate of Object.keys(this.db.snapshot())) {
        if (!seen.has(delegate) || incoming.has(delegate)) continue;
        if ([...this.dirty.values()].some((item) => item.delegate === delegate)) continue;
        this.db.replaceRows(delegate, []);
      }
    } finally {
      this.suppress = false;
    }
    this.versions.clear();
    for (const [key, version] of versions) this.versions.set(key, version);
    this.hashes.clear();
    for (const [key, hash] of hashes) this.hashes.set(key, hash);
  }

  async poll(): Promise<boolean> {
    if (!this.backend.online) {
      this.offline = true;
      return false;
    }
    const file = await this.backend.getFile(this.spreadsheetId);
    if (!file) return false;
    if (file.modifiedTime === this.seenModified && this.seenModified) {
      const changed = await this.detectValueEdits();
      if (!changed) return false;
    }
    await this.reload();
    return true;
  }

  /** A human edit that leaves updatedAt alone still wins. */
  private async detectValueEdits(): Promise<boolean> {
    const tabs = await this.backend.readTabs(this.spreadsheetId);
    for (const tab of tabs) {
      if (tab.title === "_meta") continue;
      for (let index = 1; index < tab.rows.length; index += 1) {
        const result = decodeRow(tab.title, tab.rows[index] ?? [], index + 1);
        if (!result.ok || result.deleted || result.model === "_meta") continue;
        const id = String(result.row[result.model === "householdPrefs" ? "householdId" : "id"]);
        const hash = businessHash(result.row);
        const known = this.hashes.get(rowKey(result.model, id));
        if (known && known !== hash) return true;
      }
    }
    return false;
  }

  async noteModified(): Promise<void> {
    const file = await this.backend.getFile(this.spreadsheetId);
    if (file) this.seenModified = file.modifiedTime;
  }
}

function rowKey(delegate: string, id: string): string {
  return `${delegate}:${id}`;
}

/** Household and its prefs share an id, so the Settings tab matches on record type too. */
function rowMatches(values: string[], tab: string, delegate: string, id: string): boolean {
  const columns = columnsForTab(tab);
  const cell = (field: string) => {
    const index = columns.findIndex((column) => column.field === field);
    return index >= 0 ? (values[index] ?? "") : "";
  };
  if (delegate === "householdPrefs") return cell("recordType") === "prefs" && (cell("householdId") === id || cell("id") === id);
  if (delegate === "household") return cell("recordType") !== "prefs" && cell("id") === id;
  return cell("id") === id;
}

function timeOf(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" && value) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function modelsOnSheet(tabs: { title: string; rows: string[][] }[]): Set<string> {
  const seen = new Set<string>();
  for (const tab of tabs) {
    if (tab.rows.length === 0) continue;
    if (tab.title === "Settings") {
      seen.add("household");
      seen.add("householdPrefs");
      continue;
    }
    if (tab.title === "_meta") continue;
    seen.add(modelForTab(tab.title));
  }
  return seen;
}

export function metaUpdates(): ValueUpdate[] {
  const width = columnsForTab("_meta").length;
  return [{ range: sheetRange("_meta", 2, width), values: [["schemaVersion", SCHEMA_VERSION]] }];
}
