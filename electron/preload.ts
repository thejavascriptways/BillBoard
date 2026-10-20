import { contextBridge, ipcRenderer } from "electron";

const bridge = {
  status: () => ipcRenderer.invoke("desktop:status"),
  setupPassword: (password: string) => ipcRenderer.invoke("desktop:setup-password", password),
  unlock: (password: string) => ipcRenderer.invoke("desktop:unlock", password),
  touchId: () => ipcRenderer.invoke("desktop:touch-id"),
  lock: () => ipcRenderer.send("desktop:lock"),
  setPreferences: (prefs: { autoLockMinutes?: number; openAtLogin?: boolean }) =>
    ipcRenderer.invoke("desktop:set-preferences", prefs),
  saveSecrets: (input: { databaseUrl?: string; directUrl?: string; authSecret: string; appPassword?: string }) =>
    ipcRenderer.invoke("desktop:save-secrets", input),
  connectGoogle: (input: { clientId: string; clientSecret: string; pickerApiKey?: string }) =>
    ipcRenderer.invoke("desktop:connect-google", input),
  googleKeys: () => ipcRenderer.invoke("desktop:google-keys"),
  disconnectGoogle: () => ipcRenderer.invoke("desktop:disconnect-google"),
  pickSheet: () => ipcRenderer.invoke("desktop:pick-sheet"),
  pickSheetResult: (spreadsheetId: string) => ipcRenderer.send("desktop:pick-sheet-result", spreadsheetId),
  importEnv: () => ipcRenderer.invoke("desktop:import-env"),
  backupStatus: () => ipcRenderer.invoke("desktop:backup-status"),
  setBackupPassword: (password: string) => ipcRenderer.invoke("desktop:set-backup-password", password),
  chooseBackupFolder: () => ipcRenderer.invoke("desktop:choose-backup-folder"),
  writeBackup: (input: { filename: string; fileBase64: string }) => ipcRenderer.invoke("desktop:write-backup", input),
};

contextBridge.exposeInMainWorld("billboardDesktop", bridge);
