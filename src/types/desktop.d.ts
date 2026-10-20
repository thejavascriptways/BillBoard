export type DesktopStatus = {
  hasPassword: boolean;
  touchId: boolean;
  packaged: boolean;
  needsSecrets: boolean;
  autoLockMinutes: number;
  openAtLogin: boolean;
};

export type BackupStatus = { folder: string; hasPassword: boolean };

export type DesktopResult = { ok: true } | { ok: false; error: string };

export type DesktopBridge = {
  status: () => Promise<DesktopStatus>;
  setupPassword: (password: string) => Promise<DesktopResult>;
  unlock: (password: string) => Promise<DesktopResult>;
  touchId: () => Promise<DesktopResult>;
  lock: () => void;
  setPreferences: (prefs: { autoLockMinutes?: number; openAtLogin?: boolean }) => Promise<DesktopStatus>;
  saveSecrets: (input: { databaseUrl?: string; directUrl?: string; authSecret: string; appPassword?: string }) => Promise<DesktopResult>;
  connectGoogle?: (input: { clientId: string; clientSecret: string; pickerApiKey?: string }) => Promise<DesktopResult & { email?: string }>;
  disconnectGoogle?: () => Promise<DesktopResult>;
  pickSheet?: () => Promise<{ ok: true; spreadsheetId?: string } | { ok: false; error: string }>;
  importEnv: () => Promise<DesktopResult>;
  backupStatus: () => Promise<BackupStatus>;
  setBackupPassword: (password: string) => Promise<DesktopResult>;
  chooseBackupFolder: () => Promise<{ ok: true; folder: string } | { ok: false; error: string }>;
  writeBackup: (input: { filename: string; fileBase64: string }) => Promise<DesktopResult>;
};

declare global {
  interface Window {
    billboardDesktop?: DesktopBridge;
  }
}

export {};
