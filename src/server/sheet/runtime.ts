import { readCache, writeCache } from "@/server/sheet/cache";
import { FakeDrive, GoogleBackend, type DriveFile, type SheetBackend } from "@/server/sheet/backend";
import { SheetLedger, metaUpdates } from "@/server/sheet/ledger";
import { MemoryDb } from "@/server/sheet/memory-db";
import { copyFromSource, type MigrateCounts, type SourceDump } from "@/server/sheet/migrate";
import {
  BACKUPS_FOLDER_NAME,
  FOLDER_MIME,
  FOLDER_NAME,
  SHEET_MIME,
  SPREADSHEET_NAME,
} from "@/server/sheet/schema";
import type { SheetIssue } from "@/server/sheet/codec";

export type DataStatus = {
  mode: "fake" | "google";
  connected: boolean;
  accountEmail: string | null;
  folderId: string | null;
  spreadsheetId: string | null;
  backupsFolderId: string | null;
  folderUrl: string | null;
  sheetUrl: string | null;
  backupsFolderUrl: string | null;
  driveBackups: boolean;
  offline: boolean;
  pendingWrites: number;
  missing: null | "folder" | "sheet";
  issues: SheetIssue[];
};

export type ConnectInput = {
  clientId?: string;
  clientSecret?: string;
  pickerApiKey?: string;
  email?: string;
  accessToken?: string;
  refreshToken?: string;
  folderId?: string | null;
  spreadsheetId?: string | null;
};

const globalRuntime = globalThis as unknown as { billboardRuntime?: DataRuntime };

export function folderUrl(id: string | null): string | null {
  return id ? `https://drive.google.com/drive/folders/${id}` : null;
}

export function sheetUrl(id: string | null): string | null {
  return id ? `https://docs.google.com/spreadsheets/d/${id}` : null;
}

export class DataRuntime {
  readonly client = new MemoryDb();
  backend: SheetBackend = new FakeDrive();
  ledger: SheetLedger | null = null;
  mode: "fake" | "google" = "fake";
  connected = false;
  accountEmail: string | null = null;
  folderId: string | null = null;
  spreadsheetId: string | null = null;
  backupsFolderId: string | null = null;
  driveBackups = true;
  missing: null | "folder" | "sheet" = null;
  clientId = "";
  clientSecret = "";
  refreshToken = "";
  accessToken = "";
  pickerApiKey = "";
  private booted = false;
  private bootPromise: Promise<void> | null = null;
  private persistTimer: NodeJS.Timeout | null = null;
  private pollTimer: NodeJS.Timeout | null = null;

  boot(): Promise<void> {
    if (!this.bootPromise) this.bootPromise = this.start().then(() => undefined);
    return this.bootPromise;
  }

  private async start(): Promise<void> {
    if (this.booted) return;
    this.booted = true;
    const cached = readCache();
    if (cached) {
      for (const [delegate, rows] of Object.entries(cached)) this.client.replaceRows(delegate, rows);
    }
    const token = process.env.BILLBOARD_GOOGLE_ACCESS_TOKEN?.trim();
    const spreadsheetId = process.env.BILLBOARD_SPREADSHEET_ID?.trim();
    if (token && spreadsheetId) {
      await this.connectGoogle({
        accessToken: token,
        refreshToken: process.env.BILLBOARD_GOOGLE_REFRESH_TOKEN,
        clientId: process.env.BILLBOARD_GOOGLE_CLIENT_ID,
        clientSecret: process.env.BILLBOARD_GOOGLE_CLIENT_SECRET,
        email: process.env.BILLBOARD_GOOGLE_EMAIL,
        spreadsheetId,
        folderId: process.env.BILLBOARD_FOLDER_ID,
      });
    }
    if (this.client.rows("household").length === 0 && this.mode !== "google") {
      const { seed } = await import("../../../prisma/seed");
      await seed(this.client);
    }
    this.watchPersist();
  }

  status(): DataStatus {
    const offline = this.ledger?.offline || !this.backend.online;
    return {
      mode: this.mode,
      connected: this.connected,
      accountEmail: this.accountEmail,
      folderId: this.folderId,
      spreadsheetId: this.spreadsheetId,
      backupsFolderId: this.backupsFolderId,
      folderUrl: folderUrl(this.folderId),
      sheetUrl: sheetUrl(this.spreadsheetId),
      backupsFolderUrl: folderUrl(this.backupsFolderId),
      driveBackups: this.driveBackups,
      offline,
      pendingWrites: this.ledger?.pending ?? 0,
      missing: this.missing,
      issues: this.ledger?.issues.slice() ?? [],
    };
  }

  async connectPractice(input: ConnectInput): Promise<DataStatus> {
    await this.boot();
    const clientId = input.clientId?.trim() ?? "";
    const clientSecret = input.clientSecret?.trim() ?? "";
    if (!clientId || !clientSecret) {
      throw new Error("Enter the desktop OAuth client id and secret.");
    }
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.pickerApiKey = input.pickerApiKey?.trim() ?? "";
    this.accountEmail = input.email?.trim() || "household@example.com";
    this.mode = "fake";
    if (!(this.backend instanceof FakeDrive)) this.backend = new FakeDrive();
    if (input.spreadsheetId) {
      const existing = await this.backend.getFile(input.spreadsheetId);
      if (!existing) throw new Error("That spreadsheet is not available to BillBoard yet. Use the Picker, or create a new one.");
      this.spreadsheetId = existing.id;
      this.folderId = existing.parents.find((parent) => parent !== "root") ?? null;
    }
    await this.ensureBooks(true);
    return this.status();
  }

  async connectGoogle(input: ConnectInput): Promise<DataStatus> {
    await this.prepareGoogle(input);
    await this.ensureBooks(true);
    return this.status();
  }

  private async prepareGoogle(input: ConnectInput): Promise<void> {
    if (!input.accessToken) throw new Error("Google did not return an access token.");
    this.mode = "google";
    this.accessToken = input.accessToken;
    this.refreshToken = input.refreshToken?.trim() ?? this.refreshToken;
    this.clientId = input.clientId?.trim() ?? this.clientId;
    this.clientSecret = input.clientSecret?.trim() ?? this.clientSecret;
    this.pickerApiKey = input.pickerApiKey?.trim() ?? this.pickerApiKey;
    this.accountEmail = input.email?.trim() || this.accountEmail;
    if (input.folderId) this.folderId = input.folderId;
    if (input.spreadsheetId) this.spreadsheetId = input.spreadsheetId;
    this.backend = new GoogleBackend({
      accessToken: this.accessToken,
      refreshToken: this.refreshToken || undefined,
      clientId: this.clientId || undefined,
      clientSecret: this.clientSecret || undefined,
      onToken: (token) => {
        this.accessToken = token;
      },
    });
  }

  async adoptSpreadsheet(spreadsheetId: string): Promise<DataStatus> {
    await this.boot();
    const file = await this.backend.getFile(spreadsheetId);
    if (!file || file.mimeType !== SHEET_MIME) {
      throw new Error("That spreadsheet is not available to BillBoard. Choose it with the Picker, or paste an id this app created.");
    }
    this.spreadsheetId = file.id;
    const parent = file.parents.find((id) => id !== "root");
    if (parent) this.folderId = parent;
    else if (this.folderId == null) {
      const folder = await this.backend.createFolder(FOLDER_NAME, null);
      await this.backend.moveFile(file.id, folder.id);
      this.folderId = folder.id;
    } else {
      await this.backend.moveFile(file.id, this.folderId);
    }
    await this.ensureBooks(false);
    return this.status();
  }

  async recreate(): Promise<DataStatus> {
    await this.boot();
    if (!this.connected && !this.accountEmail) throw new Error("Connect Google first.");
    this.missing = null;
    await this.ensureBooks(true);
    return this.status();
  }

  async disconnect(): Promise<DataStatus> {
    this.connected = false;
    this.accountEmail = null;
    this.folderId = null;
    this.spreadsheetId = null;
    this.backupsFolderId = null;
    this.missing = null;
    this.mode = "fake";
    this.accessToken = "";
    this.refreshToken = "";
    this.ledger = null;
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.backend = new FakeDrive();
    return this.status();
  }

  async setDriveBackups(enabled: boolean): Promise<DataStatus> {
    this.driveBackups = enabled;
    if (enabled && this.connected) await this.ensureBackups();
    return this.status();
  }

  async setOffline(offline: boolean): Promise<DataStatus> {
    if (this.mode !== "fake") throw new Error("Offline practice is only available on the practice sheet.");
    this.backend.online = !offline;
    if (this.ledger) this.ledger.offline = offline;
    return this.status();
  }

  async plantIssue(): Promise<DataStatus> {
    if (!(this.backend instanceof FakeDrive) || !this.spreadsheetId || !this.ledger) {
      throw new Error("Connect the practice sheet first.");
    }
    const sheet = this.backend.sheet(this.spreadsheetId, "Properties");
    if (!sheet) throw new Error("The Properties tab is missing.");
    const headers = sheet.rows[0] ?? [];
    const row = headers.map((header) => {
      if (header === "Id") return "not-a-real-home";
      if (header === "Kind") return "nope";
      if (header === "Name") return "Broken row";
      if (header === "Deleted") return "false";
      return "";
    });
    sheet.rows.push(row);
    await this.ledger.reload();
    return this.status();
  }

  async poll(): Promise<DataStatus> {
    if (this.ledger && this.spreadsheetId) {
      const folder = this.folderId ? await this.backend.getFile(this.folderId).catch(() => null) : null;
      const sheet = await this.backend.getFile(this.spreadsheetId).catch(() => null);
      if (this.folderId && !folder) this.missing = "folder";
      else if (!sheet) this.missing = "sheet";
      else {
        this.missing = null;
        await this.ledger.poll();
      }
    }
    return this.status();
  }

  async listSheets(): Promise<{ id: string; name: string }[]> {
    const files = await this.backend.listFiles(SHEET_MIME);
    return files.map((file) => ({ id: file.id, name: file.name }));
  }

  async uploadBackup(filename: string, bytes: Buffer): Promise<void> {
    if (!this.driveBackups || !this.connected || !this.backupsFolderId || !this.backend.online) return;
    await this.ensureBackups();
    if (!this.backupsFolderId) return;
    await this.backend.uploadFile(filename, this.backupsFolderId, bytes);
  }

  async migrate(source: SourceDump): Promise<MigrateCounts> {
    await this.boot();
    const counts = await copyFromSource(source, this.client);
    if (this.ledger) await this.ledger.flush();
    return counts;
  }

  async startStarterLists(): Promise<DataStatus> {
    await this.boot();
    if (this.client.rows("household").length === 0) {
      const { seed } = await import("../../../prisma/seed");
      await seed(this.client);
    }
    if (this.ledger) {
      this.ledger.captureAll();
      await this.ledger.flush();
    }
    return this.status();
  }

  private async ensureBooks(create: boolean): Promise<void> {
    let folder = this.folderId ? await this.backend.getFile(this.folderId) : null;
    let sheet = this.spreadsheetId ? await this.backend.getFile(this.spreadsheetId) : null;
    if (this.folderId && !folder) this.missing = "folder";
    else if (this.spreadsheetId && !sheet) this.missing = "sheet";
    else this.missing = null;
    if (!folder && !sheet && create && !this.folderId && !this.spreadsheetId) {
      // A failed or interrupted setup can leave a BillBoard folder and spreadsheet behind
      // without their ids being saved. Reuse them instead of making another pair.
      const found = await this.findBooks();
      if (found) {
        folder = found.folder;
        sheet = found.sheet;
        this.folderId = found.folder.id;
        this.spreadsheetId = found.sheet?.id ?? null;
      }
    }
    if (!folder && create) {
      folder = await this.backend.createFolder(FOLDER_NAME, null);
      this.folderId = folder.id;
      this.missing = this.spreadsheetId && !sheet ? "sheet" : null;
    }
    if (folder && !sheet && create) {
      sheet = await this.backend.createSpreadsheet(SPREADSHEET_NAME, folder.id);
      this.spreadsheetId = sheet.id;
      this.missing = null;
    }
    this.connected = Boolean(this.accountEmail);
    if (!folder || !sheet || !this.spreadsheetId) return;
    await this.ensureBackups();
    await this.backend.ensureTabs(this.spreadsheetId);
    await this.backend.writeValues(this.spreadsheetId, metaUpdates());
    this.attachLedger(this.spreadsheetId);
    const tabs = await this.backend.readTabs(this.spreadsheetId);
    const hasRows = tabs.some((tab) => tab.title !== "_meta" && tab.rows.length > 1);
    if (this.mode === "google") await this.ledger?.reload();
    else if (!hasRows) {
      this.ledger?.captureAll();
      await this.ledger?.flush();
    } else await this.ledger?.reload();
    this.startPoll();
    await this.ledger?.noteModified();
  }

  private async findBooks(): Promise<{ folder: DriveFile; sheet: DriveFile | null } | null> {
    const newest = (a: DriveFile, b: DriveFile) => b.modifiedTime.localeCompare(a.modifiedTime);
    const folders = (await this.backend.listFiles(FOLDER_MIME)).filter((file) => file.name === FOLDER_NAME).sort(newest);
    if (folders.length === 0) return null;
    const sheets = (await this.backend.listFiles(SHEET_MIME)).filter((file) => file.name === SPREADSHEET_NAME).sort(newest);
    for (const folder of folders) {
      const sheet = sheets.find((file) => file.parents.includes(folder.id));
      if (sheet) return { folder, sheet };
    }
    return { folder: folders[0], sheet: null };
  }

  private async ensureBackups(): Promise<void> {
    if (!this.folderId) return;
    if (this.backupsFolderId) {
      const existing = await this.backend.getFile(this.backupsFolderId);
      if (existing) return;
    }
    const folders = await this.backend.listFiles(FOLDER_MIME);
    const found = folders.find((file) => file.name === BACKUPS_FOLDER_NAME && file.parents.includes(this.folderId ?? ""));
    const folder = found ?? (await this.backend.createFolder(BACKUPS_FOLDER_NAME, this.folderId));
    this.backupsFolderId = folder.id;
  }

  private attachLedger(spreadsheetId: string): void {
    if (this.ledger && this.spreadsheetId === spreadsheetId) {
      this.ledger.setSpreadsheet(spreadsheetId);
      return;
    }
    this.ledger = new SheetLedger(this.client, this.backend, spreadsheetId);
    const ledgerHook = this.client.onChange;
    this.client.onChange = (delegate, row, op) => {
      ledgerHook?.(delegate, row, op);
      this.watchPersist();
    };
  }

  private watchPersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      writeCache(this.client.snapshot());
    }, 400);
    this.persistTimer.unref?.();
  }

  private startPoll(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => {
      void this.poll().catch(() => undefined);
    }, 60_000);
    this.pollTimer.unref?.();
  }
}

export function getRuntime(): DataRuntime {
  if (!globalRuntime.billboardRuntime) globalRuntime.billboardRuntime = new DataRuntime();
  return globalRuntime.billboardRuntime;
}
