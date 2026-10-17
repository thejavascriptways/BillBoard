export type DesktopStatus = {
  hasPassword: boolean;
  touchId: boolean;
  packaged: boolean;
  needsSecrets: boolean;
  autoLockMinutes: number;
  openAtLogin: boolean;
};

export type DesktopResult = { ok: true } | { ok: false; error: string };

export type DesktopBridge = {
  status: () => Promise<DesktopStatus>;
  setupPassword: (password: string) => Promise<DesktopResult>;
  unlock: (password: string) => Promise<DesktopResult>;
  touchId: () => Promise<DesktopResult>;
  lock: () => void;
  setPreferences: (prefs: { autoLockMinutes?: number; openAtLogin?: boolean }) => Promise<DesktopStatus>;
  saveSecrets: (input: { databaseUrl: string; directUrl: string; authSecret: string }) => Promise<DesktopResult>;
  importEnv: () => Promise<DesktopResult>;
};

declare global {
  interface Window {
    billboardDesktop?: DesktopBridge;
  }
}

export {};
