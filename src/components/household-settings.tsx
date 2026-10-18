"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, api } from "@/lib/api-client";
import type { ReminderPrefsDTO } from "@/lib/bill-types";

type PluginRow = { id: string; name: string; version: string; enabled: boolean; permissions: string[] };

export function HouseholdSettings() {
  const [prefs, setPrefs] = useState<ReminderPrefsDTO | null>(null);
  const [plugins, setPlugins] = useState<PluginRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [restorePassword, setRestorePassword] = useState("");
  const [restoreMode, setRestoreMode] = useState<"replace" | "merge">("merge");
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [fileText, setFileText] = useState("");
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<{ headers: string[]; rows: Record<string, string>[] } | null>(null);
  const [pluginText, setPluginText] = useState("");

  function load() {
    Promise.all([
      api<{ prefs: ReminderPrefsDTO }>("/api/v1/settings/reminders"),
      api<{ plugins: PluginRow[] }>("/api/v1/plugins"),
    ])
      .then(([prefData, pluginData]) => {
        setPrefs(prefData.prefs);
        setPlugins(pluginData.plugins);
      })
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : "Could not load settings."));
  }

  useEffect(() => {
    load();
  }, []);

  async function savePrefs() {
    if (!prefs) return;
    const saved = await api<{ prefs: ReminderPrefsDTO }>("/api/v1/settings/reminders", {
      method: "PUT",
      body: JSON.stringify(prefs),
    });
    setPrefs(saved.prefs);
    setMessage("Reminder defaults saved.");
  }

  function download(filename: string, fileBase64: string) {
    const bytes = Uint8Array.from(atob(fileBase64), (char) => char.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes]));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function exportBackup() {
    setError(null);
    try {
      const result = await api<{ filename: string; fileBase64: string }>("/api/v1/backup", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      download(result.filename, result.fileBase64);
      const desktop = window.billboardDesktop;
      if (desktop?.writeBackup) await desktop.writeBackup({ filename: result.filename, fileBase64: result.fileBase64 });
      setMessage("Backup downloaded.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not export.");
    }
  }

  async function restore() {
    if (restoreMode === "replace" && !confirmReplace) {
      setError("Confirm that replace removes the current bills, payments, and cards.");
      return;
    }
    setError(null);
    try {
      await api("/api/v1/backup", {
        method: "POST",
        body: JSON.stringify({ password: restorePassword, mode: restoreMode, fileBase64: fileText }),
      });
      setMessage(restoreMode === "replace" ? "Backup replaced the bill ledger." : "Backup merged.");
      load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not restore.");
    }
  }

  async function previewCsv() {
    const result = await api<{ headers: string[]; rows: Record<string, string>[] }>("/api/v1/imports/bills", {
      method: "POST",
      body: JSON.stringify({ action: "preview", text: csv }),
    });
    setPreview(result);
  }

  async function importCsv() {
    const result = await api<{ created: number; errors: string[] }>("/api/v1/imports/bills", {
      method: "POST",
      body: JSON.stringify({ action: "import", text: csv }),
    });
    setMessage(`Imported ${result.created} bill${result.created === 1 ? "" : "s"}. ${result.errors.join(" ")}`);
  }

  if (!prefs) return <div className="h-24 animate-pulse rounded-2xl bg-muted" />;

  return (
    <div className="grid gap-6">
      {message ? <p className="text-sm text-brand-indigo">{message}</p> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <section id="reminders" className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
        <h2 className="font-medium">Reminders</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Defaults are 7, 3, and 1 days before, plus the due day. Quiet hours hold notifications. The Mac app still checks while the window is closed.
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          {[7, 3, 1, 0].map((day) => (
            <label key={day} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={prefs.reminderDays.includes(day)}
                onChange={() =>
                  setPrefs({
                    ...prefs,
                    reminderDays: prefs.reminderDays.includes(day)
                      ? prefs.reminderDays.filter((item) => item !== day)
                      : [...prefs.reminderDays, day],
                  })
                }
              />
              {day === 0 ? "Due day" : `${day} days before`}
            </label>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="digest-hour">Daily summary hour</Label>
            <Input id="digest-hour" inputMode="numeric" value={String(prefs.digestHour)} onChange={(event) => setPrefs({ ...prefs, digestHour: Number(event.target.value) })} className="h-12!" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="digest-minute">Minute</Label>
            <Input id="digest-minute" inputMode="numeric" value={String(prefs.digestMinute)} onChange={(event) => setPrefs({ ...prefs, digestMinute: Number(event.target.value) })} className="h-12!" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="due-soon">Due soon (days)</Label>
            <Input id="due-soon" inputMode="numeric" value={String(prefs.dueSoonDays)} onChange={(event) => setPrefs({ ...prefs, dueSoonDays: Number(event.target.value) })} className="h-12!" />
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="quiet-start">Quiet hours start (minutes from midnight)</Label>
            <Input id="quiet-start" inputMode="numeric" value={String(prefs.quietStart)} onChange={(event) => setPrefs({ ...prefs, quietStart: Number(event.target.value) })} className="h-12!" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="quiet-end">Quiet hours end</Label>
            <Input id="quiet-end" inputMode="numeric" value={String(prefs.quietEnd)} onChange={(event) => setPrefs({ ...prefs, quietEnd: Number(event.target.value) })} className="h-12!" />
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">1320 is 10:00 PM and 420 is 7:00 AM. Overdue reminders resume after quiet hours, including after sleep.</p>
        <Button type="button" className="mt-3 h-11!" onClick={() => void savePrefs()}>
          Save reminders
        </Button>
      </section>
      <section id="backup" className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
        <h2 className="font-medium">Backup</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Export is AES-256-GCM. The key comes from your password with scrypt. On a Mac, automatic daily backups go to{" "}
          {prefs.backupDir || "~/Documents/BillBoard Backups"} and keep the last {prefs.retention}.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="backup-password">Backup password</Label>
            <Input id="backup-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-12!" />
          </div>
          <div className="flex items-end">
            <Button type="button" className="h-12!" onClick={() => void exportBackup()}>
              Export backup
            </Button>
          </div>
        </div>
        <div className="mt-4 grid gap-3">
          <Label htmlFor="restore-file">Restore file</Label>
          <input
            id="restore-file"
            type="file"
            accept=".billboard,application/octet-stream"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void file.arrayBuffer().then((buffer) => {
                const bytes = new Uint8Array(buffer);
                let binary = "";
                bytes.forEach((byte) => {
                  binary += String.fromCharCode(byte);
                });
                setFileText(btoa(binary));
              });
            }}
          />
          <Input type="password" aria-label="Restore password" value={restorePassword} onChange={(event) => setRestorePassword(event.target.value)} placeholder="Password for this file" className="h-12!" />
          <select aria-label="Restore mode" className="h-12 rounded-lg border border-border px-3" value={restoreMode} onChange={(event) => setRestoreMode(event.target.value as "replace" | "merge")}>
            <option value="merge">Merge into the current ledger</option>
            <option value="replace">Replace bills, payments, and cards</option>
          </select>
          {restoreMode === "replace" ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={confirmReplace} onChange={(event) => setConfirmReplace(event.target.checked)} />
              I understand replace removes the current bills, payments, and cards.
            </label>
          ) : null}
          <Button type="button" variant="outline" onClick={() => void restore()}>
            Restore
          </Button>
        </div>
      </section>
      <section id="plugins" className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
        <h2 className="font-medium">Plugins</h2>
        <ul className="mt-2 grid gap-2">
          {plugins.map((plugin) => (
            <li key={plugin.id} className="flex items-center justify-between gap-3 text-sm">
              <span>
                {plugin.name} <span className="text-muted-foreground">{plugin.version}</span>
              </span>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={plugin.enabled}
                  onChange={(event) => {
                    void api("/api/v1/plugins", {
                      method: "PATCH",
                      body: JSON.stringify({ pluginId: plugin.id, enabled: event.target.checked }),
                    }).then(load);
                  }}
                />
                Enabled
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-3 grid gap-2">
          <Label htmlFor="plugin-json">JSON bills import</Label>
          <textarea id="plugin-json" value={pluginText} onChange={(event) => setPluginText(event.target.value)} className="min-h-24 rounded-lg border border-border p-2 text-sm" placeholder='{"bills":[{"name":"Electric","payee":"Oncor","amount":"140.00","dueDate":"2026-11-06","property":"Little Elm Home","category":"Electric"}]}' />
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              void api("/api/v1/imports/bills", {
                method: "POST",
                body: JSON.stringify({ action: "plugin", pluginId: "sample-json-bills", text: pluginText }),
              }).then(() => setMessage("JSON bills imported."))
            }
          >
            Import JSON
          </Button>
        </div>
      </section>
      <section className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
        <h2 className="font-medium">CSV</h2>
        <div className="mt-2 flex flex-wrap gap-2 text-sm">
          <a className="text-primary hover:underline" href="/api/v1/exports/ledger?kind=bills">
            Export bills
          </a>
          <a className="text-primary hover:underline" href="/api/v1/exports/ledger?kind=payments">
            Export payments
          </a>
          <a className="text-primary hover:underline" href="/api/v1/exports/ledger?kind=cards">
            Export cards
          </a>
          <a className="text-primary hover:underline" href={`/api/v1/exports/year?year=${new Date().getFullYear()}`}>
            Export year matrix
          </a>
        </div>
        <div className="mt-3 grid gap-2">
          <Label htmlFor="csv-import">Import bills</Label>
          <textarea id="csv-import" value={csv} onChange={(event) => setCsv(event.target.value)} className="min-h-24 rounded-lg border border-border p-2 font-mono text-xs" placeholder="Name,Payee,Amount,Due date,Property,Category" />
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => void previewCsv()}>
              Preview mapping
            </Button>
            <Button type="button" onClick={() => void importCsv()}>
              Import
            </Button>
          </div>
          {preview ? (
            <div className="overflow-x-auto text-xs">
              <p className="mb-1 text-muted-foreground">Columns: {preview.headers.join(", ") || "none"}</p>
              <table className="w-full">
                <tbody>
                  {preview.rows.map((row, index) => (
                    <tr key={index}>
                      <td className="pr-3">{row.name}</td>
                      <td className="pr-3">{row.payee}</td>
                      <td className="pr-3">{row.amount}</td>
                      <td>{row.dueDate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
