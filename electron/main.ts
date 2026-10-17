import { randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  nativeImage,
  net,
  Notification,
  powerMonitor,
  safeStorage,
  screen,
  shell,
  Tray,
  systemPreferences,
  ipcMain,
} from "electron";

import { parseEnvFile, secretsFromEnv, type SecretBundle } from "./env-file";
import { clampAutoLockMinutes, hashLockPassword, verifyLockPassword, type LockHash } from "./password";

const APP_TITLE = "BillBoard";
const PORT = Number(process.env.BILLBOARD_PORT || 3921);
const desktopToken = randomBytes(32).toString("base64url");

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let server: ChildProcess | null = null;
let quitting = false;
let locked = true;
let secrets: SecretBundle | null = null;
let idleTimer: NodeJS.Timeout | null = null;
let reminderTimer: NodeJS.Timeout | null = null;
let pendingPath = "/";
let overdueCount = 0;

type Preferences = { autoLockMinutes: number; openAtLogin: boolean; backupDir: string };

if (process.env.BILLBOARD_SMOKE === "1" && process.env.BILLBOARD_USER_DATA) {
  app.setPath("userData", process.env.BILLBOARD_USER_DATA);
}
if (process.platform === "linux") {
  app.commandLine.appendSwitch("no-sandbox");
  app.commandLine.appendSwitch("disable-dev-shm-usage");
}
if (process.env.BILLBOARD_SMOKE === "1") {
  app.disableHardwareAcceleration();
}

app.setName(APP_TITLE);
app.setAppUserModelId("com.deepaksingla.billboard");

const gotSingleInstance = app.requestSingleInstanceLock();
if (!gotSingleInstance) {
  app.quit();
}

function userFile(name: string): string {
  return path.join(app.getPath("userData"), name);
}

function staticFile(name: string): string {
  if (app.isPackaged) return path.join(process.resourcesPath, "electron-static", name);
  return path.join(app.getAppPath(), "electron", "static", name);
}

function trayIconPath(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, "tray.png");
  return path.join(app.getAppPath(), "build", "tray.png");
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

function seal(text: string): Buffer {
  if (safeStorage.isEncryptionAvailable()) return safeStorage.encryptString(text);
  return Buffer.from(text, "utf8");
}

function openSealed(buffer: Buffer): string {
  if (safeStorage.isEncryptionAvailable()) return safeStorage.decryptString(buffer);
  return buffer.toString("utf8");
}

function readPreferences(): Preferences {
  const saved = readJson<Partial<Preferences>>(userFile("preferences.json"));
  return {
    autoLockMinutes: clampAutoLockMinutes(saved?.autoLockMinutes ?? 10),
    openAtLogin: Boolean(saved?.openAtLogin),
    backupDir: saved?.backupDir || defaultBackupDir(),
  };
}

function defaultBackupDir(): string {
  return path.join(app.getPath("documents"), "BillBoard Backups");
}

function writePreferences(prefs: Preferences): void {
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(userFile("preferences.json"), JSON.stringify(prefs, null, 2));
  app.setLoginItemSettings({ openAtLogin: prefs.openAtLogin });
}

function readLock(): LockHash | null {
  const file = userFile("lock.bin");
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(openSealed(fs.readFileSync(file))) as LockHash;
    if (parsed.v !== 1 || !parsed.hash || !parsed.salt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeLock(record: LockHash): void {
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(userFile("lock.bin"), seal(JSON.stringify(record)));
}

function readPackagedSecrets(): SecretBundle | null {
  const file = userFile("secrets.bin");
  if (!fs.existsSync(file)) return null;
  try {
    return secretsFromEnv(JSON.parse(openSealed(fs.readFileSync(file))) as Record<string, string>);
  } catch {
    return null;
  }
}

function writePackagedSecrets(bundle: SecretBundle): void {
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(userFile("secrets.bin"), seal(JSON.stringify(bundle)));
  secrets = bundle;
}

function loadDotEnv(): void {
  const file = path.join(app.getAppPath(), ".env");
  if (!fs.existsSync(file)) return;
  const parsed = parseEnvFile(fs.readFileSync(file, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function origin(): string {
  return `http://127.0.0.1:${PORT}`;
}

function result(error?: string): { ok: true } | { ok: false; error: string } {
  return error ? { ok: false, error } : { ok: true };
}

function desktopStatus() {
  const prefs = readPreferences();
  const touchId =
    process.platform === "darwin" &&
    typeof systemPreferences.canPromptTouchID === "function" &&
    systemPreferences.canPromptTouchID();
  return {
    hasPassword: readLock() !== null,
    touchId,
    packaged: app.isPackaged,
    needsSecrets: secrets === null,
    autoLockMinutes: prefs.autoLockMinutes,
    openAtLogin: app.getLoginItemSettings().openAtLogin || prefs.openAtLogin,
  };
}

async function establishSession(): Promise<void> {
  const response = await net.fetch(`${origin()}/api/v1/auth/desktop-session`, {
    method: "POST",
    headers: { "x-billboard-desktop-token": desktopToken },
  });
  if (!response.ok) {
    throw new Error(`Could not open the household session (${response.status}).`);
  }
}

function showLock(): void {
  if (!mainWindow) return;
  locked = true;
  void mainWindow.loadFile(staticFile("lock.html"));
  mainWindow.show();
  mainWindow.focus();
}

async function showApp(): Promise<void> {
  if (!mainWindow) return;
  locked = false;
  await establishSession();
  const next = pendingPath || "/";
  pendingPath = "/";
  await mainWindow.loadURL(`${origin()}${next}`);
  mainWindow.show();
  mainWindow.focus();
}

async function lockNow(): Promise<void> {
  if (locked || !mainWindow) return;
  locked = true;
  const cookies = await mainWindow.webContents.session.cookies.get({ name: "billboard_session" });
  await Promise.all(cookies.map((cookie) => mainWindow?.webContents.session.cookies.remove(origin(), cookie.name)));
  if (mainWindow.isVisible()) showLock();
}

function showWindow(): void {
  if (!mainWindow) return;
  if (locked) {
    void mainWindow.loadFile(staticFile("lock.html"));
  }
  mainWindow.show();
  mainWindow.focus();
}

async function openBill(billId: string): Promise<void> {
  pendingPath = `/bills/${billId}`;
  if (locked || !mainWindow) {
    showWindow();
    return;
  }
  await openInApp(pendingPath);
  pendingPath = "/";
}

async function openInApp(pathname: string): Promise<void> {
  if (!mainWindow || locked) {
    pendingPath = pathname;
    showWindow();
    return;
  }
  await mainWindow.loadURL(`${origin()}${pathname}`);
  mainWindow.show();
  mainWindow.focus();
}

function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: APP_TITLE,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { label: "Settings", accelerator: "CmdOrCtrl+,", click: () => void openInApp("/settings") },
        { label: "Lock", accelerator: "CmdOrCtrl+L", click: () => void lockNow() },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { label: "Quit BillBoard", accelerator: "CmdOrCtrl+Q", click: () => app.quit() },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "togglefullscreen" },
        ...(!app.isPackaged ? [{ role: "toggleDevTools" } as const] : []),
      ],
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "zoom" }, { role: "close" }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function refreshTray(): void {
  if (!tray) return;
  tray.setToolTip(overdueCount > 0 ? `${APP_TITLE} — ${overdueCount} overdue` : APP_TITLE);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      ...(overdueCount > 0 ? [{ label: `${overdueCount} overdue`, enabled: false } as const] : []),
      { label: "Open BillBoard", click: () => showWindow() },
      { label: "Lock", click: () => void lockNow() },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() },
    ]),
  );
  try {
    app.setBadgeCount(overdueCount);
  } catch {
    // Linux builds in CI may not have a dock badge.
  }
}

function createTray(): void {
  const image = nativeImage.createFromPath(trayIconPath());
  const sized = image.isEmpty() ? image : image.resize({ width: 18, height: 18 });
  tray = new Tray(sized);
  refreshTray();
  tray.on("click", () => showWindow());
}

function restoreBounds(): { x?: number; y?: number; width?: number; height?: number; maximized?: boolean } {
  const saved = readJson<{ x?: number; y?: number; width?: number; height?: number; maximized?: boolean }>(userFile("window.json"));
  const display = screen.getPrimaryDisplay().workArea;
  const width = saved?.width && saved.width > 400 ? saved.width : 1120;
  const height = saved?.height && saved.height > 400 ? saved.height : 800;
  return {
    x: saved?.x ?? display.x + Math.max(0, Math.round((display.width - width) / 2)),
    y: saved?.y ?? display.y + Math.max(0, Math.round((display.height - height) / 2)),
    width,
    height,
    maximized: saved?.maximized,
  };
}

function createWindow(): BrowserWindow {
  const bounds = restoreBounds();
  const win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: 800,
    minHeight: 600,
    show: false,
    title: APP_TITLE,
    backgroundColor: "#3A1F8F",
    autoHideMenuBar: process.platform !== "darwin",
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        // The Mac build keeps the renderer sandbox. This Linux VM cannot mount /tmp inside it.
        sandbox: process.platform === "darwin",
      },
  });
  if (bounds.maximized) win.maximize();
  win.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      win.hide();
    } else {
      const normal = win.getNormalBounds();
      fs.writeFileSync(
        userFile("window.json"),
        JSON.stringify({ ...normal, maximized: win.isMaximized() }),
      );
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.once("ready-to-show", () => win.show());
  mainWindow = win;
  return win;
}

function serverEnv(bundle: SecretBundle): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...bundle,
    NODE_ENV: app.isPackaged ? "production" : process.env.NODE_ENV || "production",
    PORT: String(PORT),
    HOSTNAME: "127.0.0.1",
    BILLBOARD_DESKTOP: "1",
    BILLBOARD_DESKTOP_TOKEN: desktopToken,
  };
}

async function runCommand(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(command)} ${args.join(" ")} exited ${code ?? "unknown"}`));
    });
  });
}

async function waitForServer(): Promise<void> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (server?.exitCode !== null && server?.exitCode !== undefined) {
      throw new Error("The BillBoard server stopped before it was ready.");
    }
    try {
      const response = await fetch(`${origin()}/api/v1/auth/desktop-session`, { method: "POST" });
      if (response.status === 401) return;
    } catch {
      // The server is still booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("The BillBoard server did not start.");
}

function prepareStandalone(root: string): string {
  const standalone = path.join(root, ".next", "standalone");
  fs.cpSync(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), { recursive: true });
  fs.cpSync(path.join(root, "public"), path.join(standalone, "public"), { recursive: true });
  return standalone;
}

async function startServer(bundle: SecretBundle): Promise<void> {
  const env = serverEnv(bundle);
  let standalone: string;
  if (app.isPackaged) {
    standalone = path.join(process.resourcesPath, "standalone");
  } else {
    const root = app.getAppPath();
    const prisma = path.join(root, "node_modules", ".bin", "prisma");
    const nextBin = path.join(root, "node_modules", ".bin", "next");
    await runCommand(prisma, ["migrate", "deploy"], root, env);
    if (!fs.existsSync(path.join(root, ".next", "standalone", "server.js"))) {
      await runCommand(nextBin, ["build"], root, env);
    }
    standalone = prepareStandalone(root);
  }
  server = spawn(process.execPath, [path.join(standalone, "server.js")], {
    cwd: standalone,
    env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: "inherit",
  });
  server.on("exit", (code) => {
    if (!quitting && code !== 0 && code !== null) {
      dialog.showErrorBox(APP_TITLE, "The local server stopped. Quit BillBoard and open it again.");
    }
  });
  await waitForServer();
}

function readBackupPassword(): string | null {
  const file = userFile("backup-password.bin");
  if (!fs.existsSync(file)) return null;
  try {
    const value = openSealed(fs.readFileSync(file)).trim();
    return value.length >= 8 ? value : null;
  } catch {
    return null;
  }
}

function writeBackupPassword(password: string): void {
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(userFile("backup-password.bin"), seal(password));
}

function writeBackupFile(filename: string, fileBase64: string): string {
  const folder = readPreferences().backupDir || defaultBackupDir();
  fs.mkdirSync(folder, { recursive: true });
  const target = path.join(folder, path.basename(filename));
  fs.writeFileSync(target, Buffer.from(fileBase64, "base64"));
  const files = fs
    .readdirSync(folder)
    .filter((name) => name.endsWith(".billboard"))
    .map((name) => ({ name, time: fs.statSync(path.join(folder, name)).mtimeMs }))
    .sort((a, b) => b.time - a.time);
  for (const extra of files.slice(14)) fs.rmSync(path.join(folder, extra.name), { force: true });
  return target;
}

async function desktopFetch(pathname: string, body: unknown): Promise<Response> {
  return net.fetch(`${origin()}${pathname}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-billboard-desktop-token": desktopToken,
    },
    body: JSON.stringify(body),
  });
}

function showReminder(item: { title: string; body: string; billId: string | null; occurrenceId: string | null }): void {
  if (!Notification.isSupported()) return;
  const note = new Notification({
    title: item.title,
    body: item.body,
    actions: item.occurrenceId
      ? [
          { type: "button", text: "Mark paid" },
          { type: "button", text: "Snooze 1 day" },
        ]
      : [],
  });
  note.on("click", () => {
    if (item.billId) void openBill(item.billId);
    else showWindow();
  });
  note.on("action", (_event, index) => {
    if (!item.occurrenceId) return;
    void desktopFetch("/api/v1/reminders/act", {
      occurrenceId: item.occurrenceId,
      action: index === 0 ? "paid" : "snooze",
    }).catch(() => undefined);
  });
  note.show();
}

async function runMaintenance(): Promise<void> {
  if (!server || locked === undefined) return;
  try {
    const response = await desktopFetch("/api/v1/reminders/dispatch", {});
    if (response.ok) {
      const data = (await response.json()) as {
        overdueCount?: number;
        notifications?: { title: string; body: string; billId: string | null; occurrenceId: string | null }[];
      };
      overdueCount = data.overdueCount ?? 0;
      refreshTray();
      for (const item of data.notifications ?? []) showReminder(item);
    }
    const password = readBackupPassword();
    if (password) {
      const backup = await desktopFetch("/api/v1/backup", { auto: true, password });
      if (backup.ok) {
        const file = (await backup.json()) as { skipped?: boolean; filename?: string; fileBase64?: string };
        if (!file.skipped && file.filename && file.fileBase64) writeBackupFile(file.filename, file.fileBase64);
      }
    }
  } catch (error) {
    console.error("Reminder check failed.", error);
  }
}

function startReminderWatch(): void {
  if (reminderTimer) clearInterval(reminderTimer);
  reminderTimer = setInterval(() => void runMaintenance(), 3 * 60 * 1000);
  powerMonitor.on("resume", () => void runMaintenance());
  void runMaintenance();
}

function startIdleWatch(): void {
  if (idleTimer) clearInterval(idleTimer);
  idleTimer = setInterval(() => {
    if (locked) return;
    const limit = readPreferences().autoLockMinutes * 60;
    if (powerMonitor.getSystemIdleTime() >= limit) void lockNow();
  }, 15_000);
  powerMonitor.on("suspend", () => void lockNow());
  powerMonitor.on("lock-screen", () => void lockNow());
}

function registerIpc(): void {
  ipcMain.handle("desktop:status", () => desktopStatus());
  ipcMain.handle("desktop:setup-password", async (_event, password: string) => {
    try {
      if (readLock()) return result("A lock password is already set.");
      writeLock(await hashLockPassword(String(password ?? "")));
      await showApp();
      return result();
    } catch (error) {
      return result(error instanceof Error ? error.message : "Could not save the password.");
    }
  });
  ipcMain.handle("desktop:unlock", async (_event, password: string) => {
    const stored = readLock();
    if (!stored) return result("Set a lock password first.");
    const matches = await verifyLockPassword(String(password ?? ""), stored);
    if (!matches) return result("That password doesn't match.");
    try {
      await showApp();
      return result();
    } catch (error) {
      return result(error instanceof Error ? error.message : "Could not unlock.");
    }
  });
  ipcMain.handle("desktop:touch-id", async () => {
    if (process.platform !== "darwin" || !systemPreferences.canPromptTouchID()) {
      return result("Touch ID is available on a Mac with Touch ID.");
    }
    if (!readLock()) return result("Set a lock password first.");
    try {
      await systemPreferences.promptTouchID("unlock BillBoard");
      await showApp();
      return result();
    } catch {
      return result("Touch ID was canceled.");
    }
  });
  ipcMain.on("desktop:lock", () => void lockNow());
  ipcMain.handle("desktop:set-preferences", (_event, prefs: { autoLockMinutes?: number; openAtLogin?: boolean }) => {
    const current = readPreferences();
    writePreferences({
      autoLockMinutes: clampAutoLockMinutes(prefs.autoLockMinutes ?? current.autoLockMinutes),
      openAtLogin: prefs.openAtLogin ?? current.openAtLogin,
      backupDir: current.backupDir,
    });
    return desktopStatus();
  });
  ipcMain.handle(
    "desktop:save-secrets",
    async (
      _event,
      input: { databaseUrl?: string; directUrl?: string; authSecret?: string },
    ) => {
      const bundle = secretsFromEnv({
        DATABASE_URL: input.databaseUrl,
        DIRECT_URL: input.directUrl,
        AUTH_SECRET: input.authSecret,
      });
      if (!bundle) {
        return result("Check the two Postgres URLs and use an AUTH_SECRET of at least 16 characters. Encode @ as %40 in the password.");
      }
      writePackagedSecrets(bundle);
      if (!server) {
        try {
          await startServer(bundle);
          showLock();
        } catch (error) {
          return result(error instanceof Error ? error.message : "Could not start BillBoard.");
        }
      }
      return result();
    },
  );
  ipcMain.handle("desktop:import-env", async () => {
    const picked = await dialog.showOpenDialog({
      title: "Import .env",
      properties: ["openFile"],
      filters: [{ name: "Env file", extensions: ["env", "txt"] }],
    });
    if (picked.canceled || !picked.filePaths[0]) return result("No file selected.");
    const parsed = parseEnvFile(fs.readFileSync(picked.filePaths[0], "utf8"));
    const bundle = secretsFromEnv(parsed);
    if (!bundle) {
      return result("That file needs DATABASE_URL and AUTH_SECRET. Encode special characters in the database password.");
    }
    writePackagedSecrets(bundle);
    try {
      if (!server) await startServer(bundle);
      showLock();
      return result();
    } catch (error) {
      return result(error instanceof Error ? error.message : "Could not start BillBoard.");
    }
  });
  ipcMain.handle("desktop:backup-status", () => ({
    folder: readPreferences().backupDir,
    hasPassword: Boolean(readBackupPassword()),
  }));
  ipcMain.handle("desktop:set-backup-password", (_event, password: string) => {
    if (!password || password.length < 8) return result("Use a backup password of at least 8 characters.");
    writeBackupPassword(password);
    return result();
  });
  ipcMain.handle("desktop:choose-backup-folder", async () => {
    const picked = await dialog.showOpenDialog({
      title: "Backup folder",
      properties: ["openDirectory", "createDirectory"],
    });
    if (picked.canceled || !picked.filePaths[0]) return { ok: false as const, error: "No folder selected." };
    const current = readPreferences();
    writePreferences({ ...current, backupDir: picked.filePaths[0] });
    return { ok: true as const, folder: picked.filePaths[0] };
  });
  ipcMain.handle("desktop:write-backup", (_event, input: { filename?: string; fileBase64?: string }) => {
    if (!input?.filename || !input.fileBase64) return result("Nothing to save.");
    writeBackupFile(input.filename, input.fileBase64);
    return result();
  });
}

async function boot(): Promise<void> {
  app.setAboutPanelOptions({
    applicationName: APP_TITLE,
    applicationVersion: app.getVersion(),
    copyright: "Private household ledger",
  });
  loadDotEnv();
  secrets = app.isPackaged ? readPackagedSecrets() : secretsFromEnv(process.env);
  registerIpc();
  buildMenu();
  createTray();
  createWindow();
  startIdleWatch();
  startReminderWatch();

  if (!secrets) {
    await mainWindow?.loadFile(staticFile("setup.html"));
    return;
  }
  try {
    await startServer(secrets);
  } catch (error) {
    dialog.showErrorBox(APP_TITLE, error instanceof Error ? error.message : "Could not start BillBoard.");
    quitting = true;
    app.quit();
    return;
  }
  if (process.env.BILLBOARD_SMOKE === "1" && !readLock()) {
    writeLock(await hashLockPassword("smoke-lock-pass"));
  }
  showLock();
  if (process.env.BILLBOARD_SMOKE === "1") {
    void runSmoke().catch((error: unknown) => {
      console.error(error);
      app.exit(1);
    });
  }
}

async function runSmoke(): Promise<void> {
  const dir = process.env.BILLBOARD_SMOKE_DIR || app.getPath("temp");
  const win = mainWindow;
  if (!win) return;
  if (win.webContents.isLoading()) {
    await new Promise<void>((resolve) => win.webContents.once("did-finish-load", () => resolve()));
  }
  await new Promise((resolve) => setTimeout(resolve, 400));
  fs.writeFileSync(path.join(dir, "screenshot_lock.png"), (await win.capturePage()).toPNG());
  await showApp();
  const deadline = Date.now() + 20_000;
  let found = false;
  while (Date.now() < deadline) {
    found = Boolean(
      await win.webContents.executeJavaScript(
        "document.body && document.body.innerText.includes('This month')",
      ),
    );
    if (found) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  fs.writeFileSync(path.join(dir, "screenshot_desktop_main.png"), (await win.capturePage()).toPNG());
  if (!found) {
    const text = await win.webContents.executeJavaScript("document.body ? document.body.innerText.slice(0, 500) : ''");
    console.error("Smoke did not reach the ledger.", text);
    app.exit(1);
    return;
  }
  if (process.env.BILLBOARD_SHOTS === "1") {
    const shots = [
      ["/", "screenshot_dashboard.png", "This month"],
      ["/calendar", "screenshot_calendar.png", "Calendar"],
      ["/bills/new", "screenshot_bill_form.png", "Quick add"],
      ["/cards?new=1", "screenshot_cards.png", "Last 4"],
      [process.env.BILLBOARD_SHOT_BILL || "/bills", "screenshot_paid.png", "Payment history"],
      ["/settings", "screenshot_settings.png", "Reminders"],
    ] as const;
    for (const [pathname, filename, marker] of shots) {
      await win.loadURL(`${origin()}${pathname}`);
      const until = Date.now() + 15_000;
      let ready = false;
      while (Date.now() < until) {
        ready = Boolean(await win.webContents.executeJavaScript(`document.body && document.body.innerText.includes(${JSON.stringify(marker)})`));
        if (ready) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
      fs.writeFileSync(path.join(dir, filename), (await win.capturePage()).toPNG());
      if (!ready) console.error("Shot missing marker", marker);
    }
    await win.webContents.executeJavaScript("document.getElementById('backup')?.scrollIntoView({ block: 'start' })");
    await new Promise((resolve) => setTimeout(resolve, 300));
    fs.writeFileSync(path.join(dir, "screenshot_backup.png"), (await win.capturePage()).toPNG());
  }
  app.quit();
}

app.on("second-instance", () => showWindow());
app.on("activate", () => showWindow());
app.on("before-quit", () => {
  quitting = true;
  if (idleTimer) clearInterval(idleTimer);
  if (reminderTimer) clearInterval(reminderTimer);
  if (server && server.exitCode === null) server.kill("SIGTERM");
});
app.on("window-all-closed", () => {
  // Stay in the menu bar until Quit. macOS and Linux both keep the tray process.
});

if (gotSingleInstance) {
  void app.whenReady().then(boot);
}
