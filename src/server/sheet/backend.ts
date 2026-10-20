import { randomUUID } from "node:crypto";

import { headerRow } from "@/server/sheet/codec";
import { columnsForTab, FOLDER_MIME, SHEET_MIME, TAB_ORDER } from "@/server/sheet/schema";

export class SheetHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "SheetHttpError";
    this.status = status;
  }
}

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  trashed: boolean;
  modifiedTime: string;
  version: string;
};

export type SheetGrid = {
  title: string;
  sheetId: number;
  rows: string[][];
  frozen: boolean;
  boldHeader: boolean;
  validations: { header: string; values?: string[]; kind?: string }[];
};

export type ValueUpdate = { range: string; values: string[][] };

/** Whole sheet rows to remove, by 1-based row number in each tab. */
export type RowDeletion = { title: string; rows: number[] };

export type SheetBackend = {
  online: boolean;
  createFolder(name: string, parentId: string | null): Promise<DriveFile>;
  createSpreadsheet(name: string, parentId: string): Promise<DriveFile>;
  getFile(id: string): Promise<DriveFile | null>;
  listFiles(mimeType: string): Promise<DriveFile[]>;
  moveFile(id: string, parentId: string): Promise<DriveFile>;
  uploadFile(name: string, parentId: string, bytes: Buffer): Promise<DriveFile>;
  ensureTabs(spreadsheetId: string): Promise<void>;
  readTabs(spreadsheetId: string): Promise<{ title: string; rows: string[][] }[]>;
  writeValues(spreadsheetId: string, updates: ValueUpdate[]): Promise<void>;
  deleteRows(spreadsheetId: string, deletions: RowDeletion[]): Promise<void>;
};

function nowIso(): string {
  return new Date().toISOString();
}

/** Google creates new grids at 1000 rows by 26 columns (A to Z). */
const DEFAULT_COLUMNS = 26;
const MIN_ROWS = 1000;

type SpreadsheetMeta = {
  sheets?: { properties?: { title?: string; sheetId?: number; gridProperties?: { rowCount?: number; columnCount?: number } } }[];
};

/** Prefix Google's own error message (for example a grid-limit reason) with ours. */
async function googleError(response: Response, fallback: string): Promise<string> {
  const text = await response.text().catch(() => "");
  let reason = "";
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } };
    reason = parsed.error?.message ?? "";
  } catch {
    reason = "";
  }
  reason = reason.replace(/\s+/g, " ").trim().slice(0, 300);
  return reason ? `${fallback} Google said: ${reason}` : fallback;
}

export class FakeDrive implements SheetBackend {
  online = true;
  failStatus: number | null = null;
  private files = new Map<string, DriveFile>();
  private grids = new Map<string, SheetGrid[]>();

  private guard(): void {
    if (!this.online) throw new SheetHttpError(503, "Offline");
    if (this.failStatus) {
      const status = this.failStatus;
      this.failStatus = null;
      throw new SheetHttpError(status, `Sheets returned ${status}`);
    }
  }

  private touch(id: string): void {
    const file = this.files.get(id);
    if (!file) return;
    file.modifiedTime = nowIso();
    file.version = String(Number(file.version) + 1);
  }

  async createFolder(name: string, parentId: string | null): Promise<DriveFile> {
    this.guard();
    const file: DriveFile = {
      id: randomUUID(),
      name,
      mimeType: FOLDER_MIME,
      parents: parentId ? [parentId] : ["root"],
      trashed: false,
      modifiedTime: nowIso(),
      version: "1",
    };
    this.files.set(file.id, file);
    return file;
  }

  async createSpreadsheet(name: string, parentId: string): Promise<DriveFile> {
    this.guard();
    const file: DriveFile = {
      id: randomUUID(),
      name,
      mimeType: SHEET_MIME,
      parents: [parentId],
      trashed: false,
      modifiedTime: nowIso(),
      version: "1",
    };
    this.files.set(file.id, file);
    this.grids.set(file.id, []);
    return file;
  }

  async getFile(id: string): Promise<DriveFile | null> {
    this.guard();
    const file = this.files.get(id);
    if (!file || file.trashed) return null;
    return { ...file, parents: file.parents.slice() };
  }

  async listFiles(mimeType: string): Promise<DriveFile[]> {
    this.guard();
    return [...this.files.values()].filter((file) => file.mimeType === mimeType && !file.trashed).map((file) => ({ ...file }));
  }

  async moveFile(id: string, parentId: string): Promise<DriveFile> {
    this.guard();
    const file = this.files.get(id);
    if (!file || file.trashed) throw new SheetHttpError(404, "Missing file");
    file.parents = [parentId];
    this.touch(id);
    return { ...file };
  }

  async uploadFile(name: string, parentId: string, bytes: Buffer): Promise<DriveFile> {
    this.guard();
    void bytes;
    const file: DriveFile = {
      id: randomUUID(),
      name,
      mimeType: "application/octet-stream",
      parents: [parentId],
      trashed: false,
      modifiedTime: nowIso(),
      version: "1",
    };
    this.files.set(file.id, file);
    return file;
  }

  async ensureTabs(spreadsheetId: string): Promise<void> {
    this.guard();
    const grids = this.grids.get(spreadsheetId);
    if (!grids) throw new SheetHttpError(404, "Missing spreadsheet");
    for (const title of TAB_ORDER) {
      if (grids.some((sheet) => sheet.title === title)) continue;
      const headers = headerRow(title);
      const validations = columnsForTab(title)
        .filter((column) => column.enumValues || column.kind === "date" || column.kind === "decimal")
        .map((column) => ({
          header: column.header,
          values: column.enumValues ? [...column.enumValues] : undefined,
          kind: column.kind,
        }));
      grids.push({
        title,
        sheetId: grids.length + 1,
        rows: [headers],
        frozen: true,
        boldHeader: true,
        validations,
      });
    }
    this.touch(spreadsheetId);
  }

  async readTabs(spreadsheetId: string): Promise<{ title: string; rows: string[][] }[]> {
    this.guard();
    const grids = this.grids.get(spreadsheetId);
    if (!grids) throw new SheetHttpError(404, "Missing spreadsheet");
    return grids.map((sheet) => ({ title: sheet.title, rows: sheet.rows.map((row) => row.slice()) }));
  }

  async writeValues(spreadsheetId: string, updates: ValueUpdate[]): Promise<void> {
    this.guard();
    const grids = this.grids.get(spreadsheetId);
    if (!grids) throw new SheetHttpError(404, "Missing spreadsheet");
    for (const update of updates) {
      const matched = /^'([^']+)'!([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(update.range);
      if (!matched) continue;
      const title = matched[1];
      const startRow = Number(matched[3]);
      const sheet = grids.find((item) => item.title === title);
      if (!sheet) continue;
      for (let offset = 0; offset < update.values.length; offset += 1) {
        const rowIndex = startRow - 1 + offset;
        while (sheet.rows.length <= rowIndex) sheet.rows.push([]);
        const existing = sheet.rows[rowIndex] ?? [];
        const next = existing.slice();
        update.values[offset].forEach((value, column) => {
          next[column] = value;
        });
        sheet.rows[rowIndex] = next;
      }
    }
    this.touch(spreadsheetId);
  }

  async deleteRows(spreadsheetId: string, deletions: RowDeletion[]): Promise<void> {
    this.guard();
    const grids = this.grids.get(spreadsheetId);
    if (!grids) throw new SheetHttpError(404, "Missing spreadsheet");
    for (const deletion of deletions) {
      const sheet = grids.find((item) => item.title === deletion.title);
      if (!sheet) continue;
      for (const rowNumber of [...new Set(deletion.rows)].sort((a, b) => b - a)) {
        if (rowNumber < 2 || rowNumber > sheet.rows.length) continue;
        sheet.rows.splice(rowNumber - 1, 1);
      }
    }
    this.touch(spreadsheetId);
  }

  sheet(spreadsheetId: string, title: string): SheetGrid | undefined {
    return this.grids.get(spreadsheetId)?.find((sheet) => sheet.title === title);
  }

  editCell(spreadsheetId: string, title: string, rowNumber: number, header: string, value: string): void {
    const sheet = this.sheet(spreadsheetId, title);
    if (!sheet) throw new Error(`Missing tab ${title}`);
    const column = sheet.rows[0]?.indexOf(header) ?? -1;
    if (column < 0) throw new Error(`Missing column ${header}`);
    while (sheet.rows.length < rowNumber) sheet.rows.push([]);
    const row = (sheet.rows[rowNumber - 1] ?? []).slice();
    row[column] = value;
    sheet.rows[rowNumber - 1] = row;
    this.touch(spreadsheetId);
  }

  trash(id: string): void {
    const file = this.files.get(id);
    if (file) file.trashed = true;
  }
}

export type GoogleAuth = {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  onToken?: (accessToken: string) => void;
};

type GoogleFile = {
  id: string;
  name?: string;
  mimeType?: string;
  parents?: string[];
  trashed?: boolean;
  modifiedTime?: string;
  version?: string;
};

export class GoogleBackend implements SheetBackend {
  online = true;
  private accessToken: string;

  constructor(private readonly auth: GoogleAuth) {
    this.accessToken = auth.accessToken;
  }

  private async request(url: string, init: RequestInit, retry = true): Promise<Response> {
    if (!this.online) throw new SheetHttpError(503, "Offline");
    const response = await fetch(url, {
      ...init,
      headers: {
        authorization: `Bearer ${this.accessToken}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...init.headers,
      },
    });
    if (response.status === 401 && retry && this.auth.refreshToken && this.auth.clientId && this.auth.clientSecret) {
      const refreshed = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: this.auth.clientId,
          client_secret: this.auth.clientSecret,
          refresh_token: this.auth.refreshToken,
          grant_type: "refresh_token",
        }),
      });
      if (!refreshed.ok) throw new SheetHttpError(401, "Google sign-in expired. Connect again.");
      const payload = (await refreshed.json()) as { access_token?: string };
      if (!payload.access_token) throw new SheetHttpError(401, "Google sign-in expired. Connect again.");
      this.accessToken = payload.access_token;
      this.auth.onToken?.(payload.access_token);
      return this.request(url, init, false);
    }
    return response;
  }

  private asFile(file: GoogleFile): DriveFile {
    return {
      id: file.id,
      name: file.name ?? "",
      mimeType: file.mimeType ?? "",
      parents: file.parents ?? [],
      trashed: Boolean(file.trashed),
      modifiedTime: file.modifiedTime ?? nowIso(),
      version: file.version ?? "1",
    };
  }

  async createFolder(name: string, parentId: string | null): Promise<DriveFile> {
    const response = await this.request("https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,parents,trashed,modifiedTime,version", {
      method: "POST",
      body: JSON.stringify({
        name,
        mimeType: FOLDER_MIME,
        parents: parentId ? [parentId] : ["root"],
      }),
    });
    if (!response.ok) throw new SheetHttpError(response.status, "Could not create the BillBoard folder.");
    return this.asFile((await response.json()) as GoogleFile);
  }

  async createSpreadsheet(name: string, parentId: string): Promise<DriveFile> {
    const response = await this.request("https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,parents,trashed,modifiedTime,version", {
      method: "POST",
      body: JSON.stringify({ name, mimeType: SHEET_MIME, parents: [parentId] }),
    });
    if (!response.ok) throw new SheetHttpError(response.status, "Could not create the BillBoard spreadsheet.");
    return this.asFile((await response.json()) as GoogleFile);
  }

  async getFile(id: string): Promise<DriveFile | null> {
    const response = await this.request(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,name,mimeType,parents,trashed,modifiedTime,version`,
      {},
    );
    if (response.status === 404) return null;
    if (!response.ok) throw new SheetHttpError(response.status, "Could not open that Drive file.");
    const file = this.asFile((await response.json()) as GoogleFile);
    return file.trashed ? null : file;
  }

  async listFiles(mimeType: string): Promise<DriveFile[]> {
    const query = encodeURIComponent(`mimeType='${mimeType}' and trashed=false`);
    const response = await this.request(
      `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,parents,trashed,modifiedTime,version)&pageSize=100`,
      {},
    );
    if (!response.ok) throw new SheetHttpError(response.status, "Could not list Drive files.");
    const payload = (await response.json()) as { files?: GoogleFile[] };
    return (payload.files ?? []).map((file) => this.asFile(file));
  }

  async moveFile(id: string, parentId: string): Promise<DriveFile> {
    const current = await this.getFile(id);
    const remove = current?.parents.filter((parent) => parent !== parentId).join(",") ?? "";
    const response = await this.request(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?addParents=${encodeURIComponent(parentId)}&removeParents=${encodeURIComponent(remove)}&fields=id,name,mimeType,parents,trashed,modifiedTime,version`,
      { method: "PATCH" },
    );
    if (!response.ok) throw new SheetHttpError(response.status, "Could not move that file into BillBoard.");
    return this.asFile((await response.json()) as GoogleFile);
  }

  async uploadFile(name: string, parentId: string, bytes: Buffer): Promise<DriveFile> {
    const boundary = `billboard${randomUUID()}`;
    const meta = JSON.stringify({ name, parents: [parentId], mimeType: "application/octet-stream" });
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),
      bytes,
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    const response = await this.request("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,parents,modifiedTime,version", {
      method: "POST",
      headers: { "content-type": `multipart/related; boundary=${boundary}` },
      body,
    });
    if (!response.ok) throw new SheetHttpError(response.status, "Could not upload the backup.");
    return this.asFile((await response.json()) as GoogleFile);
  }

  async ensureTabs(spreadsheetId: string): Promise<void> {
    const meta = await this.spreadsheet(spreadsheetId);
    const existing = new Set((meta.sheets ?? []).map((sheet) => sheet.properties?.title).filter(Boolean));
    const requests: Record<string, unknown>[] = [];
    for (const title of TAB_ORDER) {
      if (existing.has(title)) continue;
      // New grids default to 1000 x 26. Size each tab for its columns up front.
      const gridProperties = { rowCount: MIN_ROWS, columnCount: Math.max(DEFAULT_COLUMNS, columnsForTab(title).length) };
      requests.push({ addSheet: { properties: { title, gridProperties } } });
    }
    if (requests.length > 0) {
      await this.batch(spreadsheetId, requests);
    }
    const fresh = await this.spreadsheet(spreadsheetId);
    const format: Record<string, unknown>[] = [];
    const headerUpdates: ValueUpdate[] = [];
    for (const title of TAB_ORDER) {
      const sheet = fresh.sheets?.find((item) => item.properties?.title === title);
      const sheetId = sheet?.properties?.sheetId;
      if (sheetId == null) continue;
      const columns = columnsForTab(title);
      // Tabs left by an earlier attempt can still be 26 columns wide. Grow them before
      // any request below touches a column past Z, or Sheets rejects the whole batch.
      const grid = sheet?.properties?.gridProperties ?? {};
      const columnCount = Math.max(grid.columnCount ?? DEFAULT_COLUMNS, columns.length);
      const rowCount = Math.max(grid.rowCount ?? MIN_ROWS, MIN_ROWS);
      format.push({
        updateSheetProperties: {
          properties: { sheetId, gridProperties: { frozenRowCount: 1, rowCount, columnCount } },
          fields: "gridProperties.frozenRowCount,gridProperties.rowCount,gridProperties.columnCount",
        },
      });
      if (columns.length === 0) continue;
      format.push({
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: columns.length },
          cell: { userEnteredFormat: { textFormat: { bold: true } } },
          fields: "userEnteredFormat.textFormat.bold",
        },
      });
      columns.forEach((column, index) => {
        const range = { sheetId, startRowIndex: 1, endRowIndex: MIN_ROWS, startColumnIndex: index, endColumnIndex: index + 1 };
        if (column.enumValues && column.enumValues.length > 0) {
          format.push({
            setDataValidation: {
              range,
              rule: {
                condition: { type: "ONE_OF_LIST", values: column.enumValues.map((value) => ({ userEnteredValue: value })) },
                showCustomUi: true,
                strict: false,
              },
            },
          });
        } else if (column.kind === "date") {
          format.push({
            setDataValidation: {
              range,
              rule: { condition: { type: "DATE_IS_VALID" }, showCustomUi: true, strict: false },
            },
          });
        } else if (column.kind === "decimal") {
          format.push({
            setDataValidation: {
              range,
              rule: { condition: { type: "NUMBER_GREATER_THAN_EQ", values: [{ userEnteredValue: "-1000000000" }] }, showCustomUi: true, strict: false },
            },
          });
        }
      });
      const current = await this.readRange(spreadsheetId, `'${title}'!1:1`);
      if (!current[0] || current[0].every((cell) => !cell)) headerUpdates.push({ range: `'${title}'!A1`, values: [headerRow(title)] });
    }
    const ours = (fresh.sheets ?? []).filter((item) => TAB_ORDER.includes(item.properties?.title ?? ""));
    const sheet1 = fresh.sheets?.find((item) => item.properties?.title === "Sheet1");
    if (sheet1?.properties?.sheetId != null && ours.length > 0) {
      format.push({ deleteSheet: { sheetId: sheet1.properties.sheetId } });
    }
    if (format.length > 0) await this.batch(spreadsheetId, format);
    if (headerUpdates.length > 0) await this.writeValues(spreadsheetId, headerUpdates);
  }

  async readTabs(spreadsheetId: string): Promise<{ title: string; rows: string[][] }[]> {
    const ranges = TAB_ORDER.map((title) => `'${title}'!A1:ZZ`);
    const query = ranges.map((range) => `ranges=${encodeURIComponent(range)}`).join("&");
    const response = await this.request(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${query}`, {});
    if (!response.ok) throw new SheetHttpError(response.status, "Could not read the spreadsheet.");
    const payload = (await response.json()) as { valueRanges?: { values?: string[][] }[] };
    return TAB_ORDER.map((title, index) => ({ title, rows: payload.valueRanges?.[index]?.values ?? [] }));
  }

  async writeValues(spreadsheetId: string, updates: ValueUpdate[]): Promise<void> {
    if (updates.length === 0) return;
    const response = await this.request(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ valueInputOption: "RAW", data: updates }),
    });
    if (!response.ok) throw new SheetHttpError(response.status, await googleError(response, "Could not write the spreadsheet."));
  }

  async deleteRows(spreadsheetId: string, deletions: RowDeletion[]): Promise<void> {
    const wanted = deletions.filter((deletion) => deletion.rows.length > 0);
    if (wanted.length === 0) return;
    const meta = await this.spreadsheet(spreadsheetId);
    const requests: Record<string, unknown>[] = [];
    for (const deletion of wanted) {
      const sheetId = meta.sheets?.find((item) => item.properties?.title === deletion.title)?.properties?.sheetId;
      if (sheetId == null) continue;
      // Bottom-up, so removing one row never shifts another row in the same batch. Row 1 is the header.
      for (const rowNumber of [...new Set(deletion.rows)].filter((row) => row >= 2).sort((a, b) => b - a)) {
        requests.push({ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: rowNumber - 1, endIndex: rowNumber } } });
      }
    }
    if (requests.length === 0) return;
    const response = await this.request(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests }),
    });
    if (!response.ok) throw new SheetHttpError(response.status, await googleError(response, "Could not remove deleted rows from the spreadsheet."));
  }

  private async spreadsheet(id: string): Promise<SpreadsheetMeta> {
    const response = await this.request(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties`, {});
    if (!response.ok) throw new SheetHttpError(response.status, await googleError(response, "Could not open the spreadsheet."));
    return (await response.json()) as SpreadsheetMeta;
  }

  private async batch(id: string, requests: Record<string, unknown>[]): Promise<void> {
    const response = await this.request(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests }),
    });
    if (!response.ok) {
      const message = await googleError(response, "Could not set up the spreadsheet tabs.");
      console.error("[sheet-batch]", response.status, message);
      throw new SheetHttpError(response.status, message);
    }
  }

  private async readRange(id: string, range: string): Promise<string[][]> {
    const response = await this.request(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}`, {});
    if (!response.ok) return [];
    const payload = (await response.json()) as { values?: string[][] };
    return payload.values ?? [];
  }
}
