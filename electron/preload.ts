import { contextBridge, ipcRenderer } from "electron";

const bridge = {
  status: () => ipcRenderer.invoke("desktop:status"),
  setupPassword: (password: string) => ipcRenderer.invoke("desktop:setup-password", password),
  unlock: (password: string) => ipcRenderer.invoke("desktop:unlock", password),
  touchId: () => ipcRenderer.invoke("desktop:touch-id"),
  lock: () => ipcRenderer.send("desktop:lock"),
  setPreferences: (prefs: { autoLockMinutes?: number; openAtLogin?: boolean }) =>
    ipcRenderer.invoke("desktop:set-preferences", prefs),
  saveSecrets: (input: { databaseUrl: string; directUrl: string; authSecret: string }) =>
    ipcRenderer.invoke("desktop:save-secrets", input),
  importEnv: () => ipcRenderer.invoke("desktop:import-env"),
};

contextBridge.exposeInMainWorld("billboardDesktop", bridge);
