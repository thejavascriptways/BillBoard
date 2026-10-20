"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, api } from "@/lib/api-client";

type DataStatus = {
  mode: "fake" | "google";
  connected: boolean;
  accountEmail: string | null;
  folderUrl: string | null;
  sheetUrl: string | null;
  backupsFolderUrl: string | null;
  driveBackups: boolean;
  offline: boolean;
  pendingWrites: number;
  missing: null | "folder" | "sheet";
  issues: { tab: string; row: number; problem: string }[];
};

type SheetFile = { id: string; name: string };
type MigrateCounts = Record<string, { created: number; updated: number }>;

export function DataSettings() {
  const [status, setStatus] = useState<DataStatus | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [pickerKey, setPickerKey] = useState("");
  const [savedSecret, setSavedSecret] = useState(false);
  const [savedPicker, setSavedPicker] = useState(false);
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [sheets, setSheets] = useState<SheetFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [counts, setCounts] = useState<MigrateCounts | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    api<DataStatus>("/api/v1/data/status")
      .then(setStatus)
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : "Could not load the sheet."));
  }

  function loadKeys() {
    const desktop = window.billboardDesktop;
    if (!desktop?.googleKeys) return;
    desktop
      .googleKeys()
      .then((keys) => {
        if (keys.clientId) setClientId((current) => current || keys.clientId);
        setSavedSecret(keys.hasSecret);
        setSavedPicker(keys.hasPickerKey);
      })
      .catch(() => undefined);
  }

  useEffect(() => {
    load();
    loadKeys();
  }, []);

  async function connect() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const desktop = window.billboardDesktop;
      if (desktop?.connectGoogle) {
        const result = await desktop.connectGoogle({ clientId, clientSecret, pickerApiKey: pickerKey });
        if (!result.ok) throw new Error(result.error);
        setMessage(result.email ? `Signed in as ${result.email}.` : "Signed in with Google.");
      } else {
        const next = await api<DataStatus>("/api/v1/data/connect", {
          method: "POST",
          body: JSON.stringify({ clientId, clientSecret, pickerApiKey: pickerKey, spreadsheetId: spreadsheetId || undefined }),
        });
        setStatus(next);
        setMessage("Practice sheet on this computer is ready.");
      }
      load();
      const listed = await api<{ sheets: SheetFile[] }>("/api/v1/data/sheets");
      setSheets(listed.sheets);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not connect.");
    } finally {
      setBusy(false);
      if (window.billboardDesktop?.googleKeys) {
        setClientSecret("");
        setPickerKey("");
        loadKeys();
      }
    }
  }

  async function disconnect() {
    setError(null);
    if (window.billboardDesktop?.disconnectGoogle) await window.billboardDesktop.disconnectGoogle();
    setStatus(await api<DataStatus>("/api/v1/data/disconnect", { method: "POST" }));
    setCounts(null);
    setMessage("Disconnected. The sheet stays in Drive.");
  }

  async function recreate() {
    setError(null);
    try {
      setStatus(await api<DataStatus>("/api/v1/data/recreate", { method: "POST" }));
      setMessage("BillBoard folder and spreadsheet are ready.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not recreate the sheet.");
    }
  }

  async function adopt(id: string) {
    setError(null);
    try {
      setStatus(await api<DataStatus>("/api/v1/data/adopt", { method: "POST", body: JSON.stringify({ spreadsheetId: id }) }));
      setMessage("Using that BillBoard spreadsheet.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not open that spreadsheet.");
    }
  }

  async function pick() {
    setError(null);
    const desktop = window.billboardDesktop;
    if (desktop?.pickSheet && (pickerKey || savedPicker)) {
      const result = await desktop.pickSheet();
      if (result.ok && result.spreadsheetId) {
        await adopt(result.spreadsheetId);
        return;
      }
      if (!result.ok) setError(result.error);
    }
    const listed = await api<{ sheets: SheetFile[] }>("/api/v1/data/sheets");
    setSheets(listed.sheets);
    setMessage(listed.sheets.length ? "Choose a spreadsheet this app already created." : "No spreadsheets yet. Create one, or paste an id.");
  }

  async function saveBackups(enabled: boolean) {
    setStatus(await api<DataStatus>("/api/v1/data/backups", { method: "POST", body: JSON.stringify({ enabled }) }));
  }

  async function copyFromSupabase() {
    setBusy(true);
    setError(null);
    setCounts(null);
    try {
      const result = await api<{ counts: MigrateCounts }>("/api/v1/data/migrate", { method: "POST" });
      setCounts(result.counts);
      setMessage("Copied from Supabase. Running it again updates the same rows.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not copy from Supabase.");
    } finally {
      setBusy(false);
    }
  }

  async function starter() {
    setError(null);
    setStatus(await api<DataStatus>("/api/v1/data/starter", { method: "POST" }));
    setMessage("Starter lists are on the sheet.");
  }

  return (
    <section id="data" className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
      <h2 className="font-medium">Data</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        The books live in a Google Drive folder named BillBoard, in a spreadsheet of the same name. Sign in once with a desktop OAuth client. The only Drive scope is drive.file.
      </p>
      {error ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {message ? <p className="mt-3 text-sm text-muted-foreground">{message}</p> : null}

      {!status?.connected ? (
        <form
          className="mt-4 grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void connect();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="google-client-id">OAuth client id</Label>
            <Input id="google-client-id" value={clientId} onChange={(event) => setClientId(event.target.value)} autoComplete="off" className="h-12!" required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="google-client-secret">OAuth client secret</Label>
            <Input
              id="google-client-secret"
              type="password"
              value={clientSecret}
              onChange={(event) => setClientSecret(event.target.value)}
              autoComplete="off"
              className="h-12!"
              placeholder={savedSecret ? "••••••••••••  Saved" : undefined}
              aria-describedby={savedSecret ? "google-client-secret-saved" : undefined}
              required={!savedSecret}
            />
            {savedSecret ? (
              <p id="google-client-secret-saved" className="text-xs text-muted-foreground">
                Saved on this Mac. Leave blank to keep it, or paste a new one.
              </p>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="google-picker-key">Picker API key (optional)</Label>
            <Input
              id="google-picker-key"
              type={savedPicker ? "password" : "text"}
              value={pickerKey}
              onChange={(event) => setPickerKey(event.target.value)}
              autoComplete="off"
              className="h-12!"
              placeholder={savedPicker ? "••••••••••••  Saved" : undefined}
              aria-describedby={savedPicker ? "google-picker-key-saved" : undefined}
            />
            {savedPicker ? (
              <p id="google-picker-key-saved" className="text-xs text-muted-foreground">
                Saved on this Mac. Leave blank to keep it.
              </p>
            ) : null}
          </div>
          <Button type="submit" className="h-11! w-fit" disabled={busy}>
            Sign in with Google
          </Button>
        </form>
      ) : (
        <div className="mt-4 grid gap-3 text-sm">
          <p>
            Signed in as <span className="font-medium">{status.accountEmail}</span>
            {status.mode === "fake" ? " · Practice sheet on this computer" : ""}.
          </p>
          <div className="flex flex-wrap gap-3">
            {status.folderUrl ? (
              <a className="font-medium text-primary underline-offset-4 hover:underline" href={status.folderUrl} target="_blank" rel="noreferrer">
                Open folder in Google Drive
              </a>
            ) : null}
            {status.sheetUrl ? (
              <a className="font-medium text-primary underline-offset-4 hover:underline" href={status.sheetUrl} target="_blank" rel="noreferrer">
                Open spreadsheet in Google Drive
              </a>
            ) : null}
          </div>
          {status.missing ? (
            <div className="rounded-xl bg-muted p-3">
              <p>The {status.missing === "folder" ? "BillBoard folder" : "BillBoard spreadsheet"} is missing from Drive.</p>
              <Button type="button" className="mt-2 h-10!" onClick={() => void recreate()}>
                Recreate it
              </Button>
            </div>
          ) : null}
          <Button type="button" variant="outline" className="h-10! w-fit" onClick={() => void disconnect()}>
            Disconnect
          </Button>
        </div>
      )}

      <div className="mt-6 grid gap-2">
        <h3 className="font-medium">Use an existing BillBoard sheet</h3>
        <p className="text-sm text-muted-foreground">After a reinstall, pick the spreadsheet or paste its id. The Picker grants drive.file access to that file. Without a Picker API key, the list is files this app already created.</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="h-10!" onClick={() => void pick()}>
            Choose spreadsheet
          </Button>
          <Input aria-label="Spreadsheet id" value={spreadsheetId} onChange={(event) => setSpreadsheetId(event.target.value)} placeholder="Spreadsheet id" className="h-10! max-w-xs" />
          <Button type="button" variant="outline" className="h-10!" onClick={() => void adopt(spreadsheetId)}>
            Use this id
          </Button>
        </div>
        {sheets.length > 0 ? (
          <ul className="grid gap-1">
            {sheets.map((sheet) => (
              <li key={sheet.id}>
                <button type="button" className="text-left text-sm font-medium text-primary" onClick={() => void adopt(sheet.id)}>
                  {sheet.name} · {sheet.id}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="mt-6">
        <h3 className="font-medium">Sheet issues</h3>
        {status && status.issues.length === 0 ? <p className="mt-1 text-sm text-muted-foreground">No problems in the sheet.</p> : null}
        {status && status.issues.length > 0 ? (
          <ul className="mt-2 grid gap-2">
            {status.issues.map((issue) => (
              <li key={`${issue.tab}-${issue.row}-${issue.problem}`} className="rounded-xl bg-muted px-3 py-2 text-sm">
                <span className="font-medium">{issue.tab}</span> row {issue.row}: {issue.problem}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="mt-6 grid gap-2">
        <h3 className="font-medium">Copy from Supabase</h3>
        <p className="text-sm text-muted-foreground">
          One-time copy of the Postgres database into this sheet. Ids stay put when they can. A starter row with the same slug or name is updated instead of duplicated. Safe to run again.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" className="h-10! w-fit" disabled={busy} onClick={() => void copyFromSupabase()}>
            Copy from Supabase
          </Button>
          <Button type="button" variant="outline" className="h-10! w-fit" onClick={() => void starter()}>
            Start with starter lists
          </Button>
        </div>
        {counts ? (
          <ul className="grid gap-1 text-sm">
            {Object.entries(counts)
              .filter(([, count]) => count.created > 0 || count.updated > 0)
              .map(([tab, count]) => (
                <li key={tab}>
                  {tab}: {count.created} added, {count.updated} updated
                </li>
              ))}
          </ul>
        ) : null}
      </div>

      <label className="mt-6 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={status?.driveBackups ?? true}
          onChange={(event) => void saveBackups(event.target.checked)}
        />
        <span>
          Also save encrypted backups in the Backups folder inside BillBoard on Google Drive. A copy still goes to the local backup folder.
          {status?.backupsFolderUrl ? (
            <>
              {" "}
              <a className="font-medium text-primary underline-offset-4 hover:underline" href={status.backupsFolderUrl} target="_blank" rel="noreferrer">
                Open Backups in Google Drive
              </a>
            </>
          ) : null}
        </span>
      </label>
    </section>
  );
}
