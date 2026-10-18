"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, api } from "@/lib/api-client";
import { MASTER_TABLES, type MasterRow, type MasterTableId } from "@/lib/masters";
import { cn } from "cn";

type Draft = {
  name: string;
  address: string;
  notes: string;
  color: string;
  parentId: string;
  status: string;
  key: string;
  last4: string;
};

const emptyDraft = (): Draft => ({
  name: "",
  address: "",
  notes: "",
  color: "#534C66",
  parentId: "",
  status: "active",
  key: "other",
  last4: "",
});

export function ConfigurationBoard() {
  const [table, setTable] = useState<MasterTableId>("homes");
  const [rows, setRows] = useState<MasterRow[]>([]);
  const [types, setTypes] = useState<MasterRow[]>([]);
  const [groups, setGroups] = useState<MasterRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<MasterRow | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [remove, setRemove] = useState<MasterRow | null>(null);
  const [intoId, setIntoId] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const meta = MASTER_TABLES.find((item) => item.id === table)!;

  function load(next = table) {
    const params = new URLSearchParams(window.location.search);
    api<{ rows: MasterRow[] }>(`/api/v1/masters?table=${next}`)
      .then((data) => {
        setRows(data.rows);
        setError(null);
        if (params.get("merge") === "1") {
          const named = data.rows.find((row) => row.name === "Demo cottage") ?? data.rows.find((row) => row.usage > 0) ?? data.rows[0];
          if (named) {
            setRemove(named);
            setIntoId(data.rows.find((row) => row.id !== named.id && row.isActive)?.id ?? "");
          }
        }
        if (params.get("add") === "1") {
          setDraft(emptyDraft());
          setEditor("new");
        }
      })
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : "Could not load this list."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("table");
    const initial = MASTER_TABLES.some((item) => item.id === requested) ? (requested as MasterTableId) : "homes";
    const timer = setTimeout(() => setTable(initial), 0);
    load(initial);
    api<{ rows: MasterRow[] }>("/api/v1/masters?table=property-types&active=1").then((data) => setTypes(data.rows)).catch(() => undefined);
    api<{ rows: MasterRow[] }>("/api/v1/masters?table=categories").then((data) => setGroups(data.rows.filter((row) => !row.parentId))).catch(() => undefined);
    return () => clearTimeout(timer);
    // Initial table comes from the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount
  }, []);

  function choose(next: MasterTableId) {
    setTable(next);
    setQuery("");
    setRemove(null);
    setLoading(true);
    load(next);
    const url = new URL(window.location.href);
    url.searchParams.set("table", next);
    url.searchParams.delete("merge");
    window.history.replaceState(null, "", url.pathname + url.search);
  }

  const shown = rows.filter((row) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return row.name.toLowerCase().includes(q) || (row.detail ?? "").toLowerCase().includes(q);
  });

  function openEdit(row: MasterRow) {
    setDraft({
      name: row.name,
      address: row.address ?? "",
      notes: row.notes ?? "",
      color: row.color ?? "#534C66",
      parentId: row.parentId ?? "",
      status: row.status ?? "active",
      key: row.key,
      last4: row.last4 ?? "",
    });
    setEditor(row);
  }

  async function save() {
    setError(null);
    const body = {
      table,
      name: draft.name,
      address: draft.address,
      notes: draft.notes,
      color: draft.color,
      parentId: draft.parentId || null,
      status: draft.status,
      key: draft.key,
      last4: draft.last4,
    };
    try {
      if (editor && editor !== "new") {
        await api("/api/v1/masters", { method: "POST", body: JSON.stringify({ ...body, action: "update", id: editor.id }) });
      } else {
        await api("/api/v1/masters", { method: "POST", body: JSON.stringify(body) });
      }
      setEditor(null);
      load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save.");
    }
  }

  async function toggle(row: MasterRow) {
    await api("/api/v1/masters", { method: "POST", body: JSON.stringify({ table, action: "active", id: row.id, isActive: !row.isActive }) });
    load();
  }

  async function saveOrder(row: MasterRow, value: string) {
    const sortOrder = Number(value);
    if (!Number.isFinite(sortOrder)) return;
    await api("/api/v1/masters", { method: "POST", body: JSON.stringify({ table, action: "update", id: row.id, sortOrder }) });
    load();
  }

  async function confirmDelete() {
    if (!remove) return;
    setError(null);
    try {
      await api("/api/v1/masters", { method: "POST", body: JSON.stringify({ table, action: "delete", id: remove.id }) });
      setRemove(null);
      load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not delete it.");
    }
  }

  async function merge() {
    if (!remove || !intoId) return;
    setError(null);
    try {
      const result = await api<{ moved: number; deleted: boolean }>("/api/v1/masters", {
        method: "POST",
        body: JSON.stringify({ table, action: "merge", id: remove.id, intoId }),
      });
      setMessage(result.deleted ? `Moved ${result.moved} records and removed the old value.` : `Moved ${result.moved} records. This system value stays on the list.`);
      setRemove(null);
      load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not merge.");
    }
  }

  async function makeInactive() {
    if (!remove) return;
    await api("/api/v1/masters", { method: "POST", body: JSON.stringify({ table, action: "active", id: remove.id, isActive: false }) });
    setRemove(null);
    load();
  }

  return (
    <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
      <div>
        <h1 className="font-display text-4xl tracking-tight">Configuration</h1>
        <p className="mt-1 text-sm text-muted-foreground">Master lists for every dropdown. Inactive values stay on old records and drop out of new ones.</p>
        <label className="mt-4 grid gap-1 text-sm md:hidden">
          List
          <select aria-label="Master table" className="h-11 rounded-lg border border-border bg-background px-3" value={table} onChange={(event) => choose(event.target.value as MasterTableId)}>
            {MASTER_TABLES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <nav className="mt-4 hidden gap-1 md:grid" aria-label="Master tables">
          {MASTER_TABLES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => choose(item.id)}
              className={cn("min-h-11 rounded-xl px-3 text-left text-sm font-medium", table === item.id ? "bg-brand text-white" : "hover:bg-muted")}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>
      <section className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-medium">{meta.label}</h2>
            {meta.system ? (
              <p className="mt-1 text-sm text-muted-foreground">These values drive reminders, due dates, and statuses. They are read-only.</p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">{rows.length} values. Search, reorder, or turn one off.</p>
            )}
          </div>
          {meta.creatable ? (
            <Button type="button" className="bg-brand text-white" onClick={() => { setDraft(emptyDraft()); setEditor("new"); }}>Add</Button>
          ) : null}
        </div>
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${meta.label.toLowerCase()}`} aria-label="Search this list" className="h-11!" />
        {message ? <p className="text-sm text-primary">{message}</p> : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        {loading ? <div className="h-40 animate-pulse rounded-2xl bg-muted" /> : null}
        {!loading && shown.length === 0 ? <p className="text-sm text-muted-foreground">Nothing in this list yet.</p> : null}
        <ul className="grid gap-2">
          {shown.map((row) => (
            <li key={row.id} className="grid items-center gap-3 rounded-2xl bg-card p-3 ring-1 ring-foreground/10 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_5rem_5rem_auto]">
              <div>
                <p className="font-medium">{row.name}</p>
                {row.detail ? <p className="text-xs text-muted-foreground">{row.detail}</p> : null}
              </div>
              <p className="text-sm text-muted-foreground">{row.usage} used</p>
              {meta.system ? <span /> : (
                <label className="text-xs text-muted-foreground">
                  Order
                  <input
                    aria-label={`${row.name} order`}
                    defaultValue={row.sortOrder}
                    inputMode="numeric"
                    className="mt-1 h-9 w-16 rounded-lg border border-border px-2"
                    onBlur={(event) => void saveOrder(row, event.target.value)}
                  />
                </label>
              )}
              {meta.system ? <span /> : (
                <button type="button" className="text-left text-sm underline-offset-2 hover:underline" onClick={() => void toggle(row)}>
                  {row.isActive ? "Active" : "Inactive"}
                </button>
              )}
              {meta.system ? null : (
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => openEdit(row)}>Edit</Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => { setIntoId(rows.find((item) => item.id !== row.id && item.isActive)?.id ?? ""); setRemove(row); }}>Delete</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <Dialog open={editor != null} onOpenChange={(open) => { if (!open) setEditor(null); }}>
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editor === "new" ? `Add ${meta.label.toLowerCase()}` : `Edit ${meta.label.toLowerCase()}`}</DialogTitle>
            <DialogDescription>Saved values show up in the dropdowns that use this list.</DialogDescription>
          </DialogHeader>
          <form id="master-form" className="grid gap-3" onSubmit={(event) => { event.preventDefault(); void save(); }}>
            <div className="grid gap-1">
              <Label htmlFor="master-name">{table === "payment-modes" || table === "property-types" ? "Display label" : "Name"}</Label>
              <Input id="master-name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required className="h-11!" />
            </div>
            {table === "homes" ? (
              <>
                <div className="grid gap-1">
                  <Label htmlFor="master-address">Address</Label>
                  <Input id="master-address" value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} className="h-11!" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1">
                    <Label htmlFor="master-type">Type</Label>
                    <select id="master-type" className="h-11 rounded-lg border border-border bg-background px-3 text-sm" value={draft.key} onChange={(event) => setDraft({ ...draft, key: event.target.value })}>
                      {types.map((type) => <option key={type.id} value={type.key}>{type.name}</option>)}
                    </select>
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="master-status">Status</Label>
                    <select id="master-status" className="h-11 rounded-lg border border-border bg-background px-3 text-sm" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>
                      <option value="active">Active</option>
                      <option value="upcoming">Upcoming</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                </div>
              </>
            ) : null}
            {table === "categories" || table === "utility-types" ? (
              <div className="grid gap-1">
                <Label htmlFor="master-color">Color</Label>
                <Input id="master-color" type="color" value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} className="h-11!" />
              </div>
            ) : null}
            {table === "categories" ? (
              <div className="grid gap-1">
                <Label htmlFor="master-parent">Group</Label>
                <select id="master-parent" className="h-11 rounded-lg border border-border bg-background px-3 text-sm" value={draft.parentId} onChange={(event) => setDraft({ ...draft, parentId: event.target.value })}>
                  <option value="">This is a group</option>
                  {groups.filter((group) => editor === "new" || group.id !== editor?.id).map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                </select>
              </div>
            ) : null}
            {table === "payees" || table === "payment-methods" ? (
              <div className="grid gap-1">
                <Label htmlFor="master-last4">Last 4</Label>
                <Input id="master-last4" inputMode="numeric" value={draft.last4} onChange={(event) => setDraft({ ...draft, last4: event.target.value })} className="h-11!" />
              </div>
            ) : null}
            {table === "homes" || table === "people" || table === "payees" ? (
              <div className="grid gap-1">
                <Label htmlFor="master-notes">Notes</Label>
                <textarea id="master-notes" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} className="min-h-20 rounded-lg border border-border p-2 text-sm" />
              </div>
            ) : null}
            {table === "payment-modes" || (editor !== "new" && editor?.system) ? (
              <p className="text-xs text-muted-foreground">The stored key stays {editor !== "new" ? editor?.key : "fixed"}. Only the label and active flag change.</p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditor(null)}>Cancel</Button>
              <Button type="submit" className="bg-brand text-white">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={remove != null} onOpenChange={(open) => { if (!open) setRemove(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {remove?.name}?</DialogTitle>
            <DialogDescription>
              {remove && remove.usage > 0
                ? `${remove.name} is used on ${remove.usage} ${remove.usage === 1 ? "record" : "records"}. Make it inactive, or merge those records into another value and then delete it.`
                : remove?.system
                  ? "This value drives app behavior. Make it inactive to hide it from new entries."
                  : "This value is not used. Deleting it cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          {remove && (remove.usage > 0 || remove.system) ? (
            <div className="grid gap-2">
              <Label htmlFor="merge-into">Merge into</Label>
              <select id="merge-into" className="h-11 rounded-lg border border-border bg-background px-3 text-sm" value={intoId} onChange={(event) => setIntoId(event.target.value)}>
                <option value="">Choose a value</option>
                {rows.filter((row) => row.id !== remove.id && row.isActive).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
              </select>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRemove(null)}>Cancel</Button>
            {remove && remove.usage === 0 && !remove.system ? (
              <Button type="button" variant="destructive" onClick={() => void confirmDelete()}>Delete</Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => void makeInactive()}>Make inactive</Button>
                <Button type="button" className="bg-brand text-white" disabled={!intoId} onClick={() => void merge()}>Merge into…</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
