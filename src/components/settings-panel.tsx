"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";

import { ChoiceSelect } from "@/components/choice-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api } from "@/lib/api-client";
import { APP_NAME } from "@/lib/constants";
import type { CategoryDTO, PaymentMethodDTO, PropertyDTO } from "@/lib/types";

type Kind = "property" | "category" | "payment";

type Row = {
  id: string;
  title: string;
  detail: string | null;
  archived: boolean;
  expenseCount: number;
  sortOrder: number;
};

type Editor =
  | { kind: Kind; mode: "create" }
  | { kind: "property"; mode: "edit"; item: PropertyDTO }
  | { kind: "category"; mode: "edit"; item: CategoryDTO }
  | { kind: "payment"; mode: "edit"; item: PaymentMethodDTO }
  | { kind: Kind; mode: "remove"; item: Row }
  | { kind: "samples"; mode: "clear" }
  | null;

const NOUN: Record<Kind, string> = {
  property: "property",
  category: "category",
  payment: "payment method",
};

export function SettingsPanel() {
  const [properties, setProperties] = useState<PropertyDTO[]>([]);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodDTO[]>([]);
  const [sampleCount, setSampleCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<Editor>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [kind, setKind] = useState("other");
  const [homeStatus, setHomeStatus] = useState("active");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [roleStartsOn, setRoleStartsOn] = useState("");
  const [roleBecomes, setRoleBecomes] = useState("");
  const [last4, setLast4] = useState("");
  const [color, setColor] = useState("#534C66");
  const [parentId, setParentId] = useState("");
  const [reassignTo, setReassignTo] = useState("");
  const [pending, setPending] = useState(false);

  async function load() {
    setError(null);
    try {
      const [propertyData, categoryData, methodData, samples] = await Promise.all([
        api<{ properties: PropertyDTO[] }>("/api/v1/properties"),
        api<{ categories: CategoryDTO[] }>("/api/v1/categories"),
        api<{ paymentMethods: PaymentMethodDTO[] }>("/api/v1/payment-methods"),
        api<{ count: number }>("/api/v1/sample-expenses"),
      ]);
      setProperties(propertyData.properties);
      setCategories(categoryData.categories);
      setPaymentMethods(methodData.paymentMethods);
      setSampleCount(samples.count);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load settings.");
    }
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api<{ properties: PropertyDTO[] }>("/api/v1/properties"),
      api<{ categories: CategoryDTO[] }>("/api/v1/categories"),
      api<{ paymentMethods: PaymentMethodDTO[] }>("/api/v1/payment-methods"),
      api<{ count: number }>("/api/v1/sample-expenses"),
    ])
      .then(([propertyData, categoryData, methodData, samples]) => {
        if (cancelled) return;
        setProperties(propertyData.properties);
        setCategories(categoryData.categories);
        setPaymentMethods(methodData.paymentMethods);
        setSampleCount(samples.count);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof ApiError ? caught.message : "Could not load settings.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function resetFields() {
    setName("");
    setAddress("");
    setNotes("");
    setKind("other");
    setHomeStatus("active");
    setPurchaseDate("");
    setRoleStartsOn("");
    setRoleBecomes("");
    setLast4("");
    setColor("#534C66");
    setParentId("");
    setReassignTo("");
    setError(null);
  }

  function openCreate(kind: Kind) {
    resetFields();
    setEditor({ kind, mode: "create" });
  }

  function openProperty(property: PropertyDTO) {
    resetFields();
    setName(property.name);
    setAddress(property.address ?? "");
    setNotes(property.notes ?? "");
    setKind(property.kind);
    setHomeStatus(property.status);
    setPurchaseDate(property.purchaseDate ?? "");
    setRoleStartsOn(property.roleStartsOn ?? "");
    setRoleBecomes(property.roleBecomes ?? "");
    setEditor({ kind: "property", mode: "edit", item: property });
  }

  function openCategory(category: CategoryDTO) {
    resetFields();
    setName(category.name);
    setColor(category.color || "#534C66");
    setParentId(category.parentId ?? "");
    setEditor({ kind: "category", mode: "edit", item: category });
  }

  function openPayment(method: PaymentMethodDTO) {
    resetFields();
    setName(method.nickname);
    setLast4(method.last4 ?? "");
    setEditor({ kind: "payment", mode: "edit", item: method });
  }

  function openRemove(kind: Kind, item: Row) {
    resetFields();
    const choices = replacements(kind, item.id);
    setReassignTo(choices[0]?.id ?? "");
    setEditor({ kind, mode: "remove", item });
  }

  function rowsFor(kind: Kind): Row[] {
    if (kind === "property") {
      return properties.map((property) => ({
        id: property.id,
        title: property.name,
        detail:
          [
            property.kind,
            property.status,
            property.roleStartsOn && property.roleBecomes
              ? `becomes ${property.roleBecomes} ${property.roleStartsOn}`
              : null,
            property.address,
          ]
            .filter(Boolean)
            .join(" · ") || null,
        archived: property.archived,
        expenseCount: property.expenseCount,
        sortOrder: property.sortOrder,
      }));
    }
    if (kind === "category") {
      return categories.map((category) => ({
        id: category.id,
        title: category.name,
        detail: null,
        archived: category.archived,
        expenseCount: category.expenseCount,
        sortOrder: category.sortOrder,
      }));
    }
    return paymentMethods.map((method) => ({
      id: method.id,
      title: method.label,
      detail: null,
      archived: method.archived,
      expenseCount: method.expenseCount,
      sortOrder: method.sortOrder,
    }));
  }

  function replacements(kind: Kind, id: string): { id: string; label: string }[] {
    return rowsFor(kind)
      .filter((row) => row.id !== id && !row.archived)
      .map((row) => ({ id: row.id, label: row.title }));
  }

  async function saveEditor() {
    if (!editor) return;
    if ((editor.mode === "create" || editor.mode === "edit") && !name.trim()) {
      setError(editor.kind === "payment" ? "Enter a nickname." : "Enter a name.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      if (editor.mode === "create" || editor.mode === "edit") {
        if (editor.kind === "property" && editor.mode === "create") {
          await api("/api/v1/properties", {
            method: "POST",
            body: JSON.stringify({
              name,
              address,
              notes,
              kind,
              status: homeStatus,
              purchaseDate: purchaseDate || null,
              roleStartsOn: roleStartsOn || null,
              roleBecomes: roleBecomes || null,
            }),
          });
          setStatus("Property added.");
        } else if (editor.kind === "property" && editor.mode === "edit") {
          await api(`/api/v1/properties/${editor.item.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              name,
              address,
              notes,
              kind,
              status: homeStatus,
              purchaseDate: purchaseDate || null,
              roleStartsOn: roleStartsOn || null,
              roleBecomes: roleBecomes || null,
            }),
          });
          setStatus("Property updated.");
        } else if (editor.kind === "category" && editor.mode === "create") {
          await api("/api/v1/categories", { method: "POST", body: JSON.stringify({ name, color, parentId: parentId || null }) });
          setStatus("Category added.");
        } else if (editor.kind === "category" && editor.mode === "edit") {
          await api(`/api/v1/categories/${editor.item.id}`, {
            method: "PATCH",
            body: JSON.stringify({ name, color, parentId: parentId || null }),
          });
          setStatus("Category updated.");
        } else if (editor.kind === "payment" && editor.mode === "create") {
          await api("/api/v1/payment-methods", {
            method: "POST",
            body: JSON.stringify({ nickname: name, last4 }),
          });
          setStatus("Payment method added.");
        } else if (editor.kind === "payment" && editor.mode === "edit") {
          await api(`/api/v1/payment-methods/${editor.item.id}`, {
            method: "PATCH",
            body: JSON.stringify({ nickname: name, last4 }),
          });
          setStatus("Payment method updated.");
        }
      } else if (editor.kind === "samples") {
        const result = await api<{ deleted: number }>("/api/v1/sample-expenses", { method: "DELETE" });
        setStatus(`Cleared ${result.deleted} sample expense${result.deleted === 1 ? "" : "s"}.`);
      } else if (editor.mode === "remove") {
        if (editor.item.expenseCount > 0) {
          const result = await api<{ moved: number }>(endpoint(editor.kind, editor.item.id, "reassign"), {
            method: "POST",
            body: JSON.stringify({ toId: reassignTo }),
          });
          setStatus(`Moved ${result.moved} expense${result.moved === 1 ? "" : "s"} and deleted ${editor.item.title}.`);
        } else {
          await api(endpoint(editor.kind, editor.item.id), { method: "DELETE" });
          setStatus(`${capitalize(NOUN[editor.kind])} deleted.`);
        }
      }
      setEditor(null);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save.");
    } finally {
      setPending(false);
    }
  }

  async function setArchived(kind: Kind, id: string, archived: boolean): Promise<boolean> {
    setPending(true);
    setError(null);
    try {
      await api(endpoint(kind, id), {
        method: "PATCH",
        body: JSON.stringify({ archived }),
      });
      setStatus(archived ? `${capitalize(NOUN[kind])} archived.` : `${capitalize(NOUN[kind])} restored.`);
      await load();
      return true;
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not update that.");
      return false;
    } finally {
      setPending(false);
    }
  }

  async function move(kind: Kind, id: string, direction: -1 | 1) {
    const ids = movedIds(rowsFor(kind), id, direction);
    if (!ids) return;
    setPending(true);
    setError(null);
    try {
      await api(endpoint(kind, "", "reorder"), {
        method: "POST",
        body: JSON.stringify({ ids }),
      });
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not reorder.");
    } finally {
      setPending(false);
    }
  }

  async function signOut() {
    try {
      await api("/api/v1/auth/logout", { method: "POST" });
    } catch {
      // A 401 already sends the browser to the login page.
    }
    // Full load so the proxy sees the cleared cookie. A client navigation can
    // keep the old session and bounce straight back into the app.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full load so the cleared cookie is visible to the proxy
    window.location.assign("/login");
  }

  const editing = editor?.mode === "create" || editor?.mode === "edit";
  const removing = editor?.mode === "remove" ? editor : null;
  const removeChoices = removing ? replacements(removing.kind, removing.item.id) : [];

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <div>
        <h1 className="font-display text-4xl tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Properties, categories, and payment methods start as defaults. Rename them, archive them, or remove them.
        </p>
      </div>
      {status ? (
        <p role="status" className="rounded-xl bg-secondary px-3 py-2 text-sm text-brand-indigo">
          {status}
        </p>
      ) : null}
      {error && !editor ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}

      {!loading ? (
      <>
      <CatalogSection
        title="Properties"
        description="A name, an optional address, and notes. Use one for spending that isn’t tied to a home."
        addLabel="Add"
        rows={rowsFor("property")}
        pending={pending}
        onAdd={() => openCreate("property")}
        onEdit={(id) => {
          const property = properties.find((item) => item.id === id);
          if (property) openProperty(property);
        }}
        onArchive={(id, archived) => setArchived("property", id, archived)}
        onRemove={(row) => openRemove("property", row)}
        onMove={(id, direction) => move("property", id, direction)}
      />
      <CatalogSection
        title="Categories"
        description="How spending is grouped when you log an expense."
        addLabel="Add"
        rows={rowsFor("category")}
        pending={pending}
        onAdd={() => openCreate("category")}
        onEdit={(id) => {
          const category = categories.find((item) => item.id === id);
          if (category) openCategory(category);
        }}
        onArchive={(id, archived) => setArchived("category", id, archived)}
        onRemove={(row) => openRemove("category", row)}
        onMove={(id, direction) => move("category", id, direction)}
      />
      <CatalogSection
        title="Payment methods"
        description="A nickname, plus the last 4 digits of a card or account. Never the full number."
        addLabel="Add"
        rows={rowsFor("payment")}
        pending={pending}
        onAdd={() => openCreate("payment")}
        onEdit={(id) => {
          const method = paymentMethods.find((item) => item.id === id);
          if (method) openPayment(method);
        }}
        onArchive={(id, archived) => setArchived("payment", id, archived)}
        onRemove={(row) => openRemove("payment", row)}
        onMove={(id, direction) => move("payment", id, direction)}
      />

      <section className="grid gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
        <h2 className="font-medium">Sample expenses</h2>
        <p className="text-sm text-muted-foreground">
          {sampleCount === 0
            ? "No sample rows. Real expenses are never removed by this action."
            : `${sampleCount} sample ${sampleCount === 1 ? "row is" : "rows are"} marked Sample and start with “SAMPLE ·”.`}
        </p>
        <Button type="button" variant="outline" className="h-11!" disabled={sampleCount === 0} onClick={() => setEditor({ kind: "samples", mode: "clear" })}>
          Clear sample expenses
        </Button>
      </section>

      <section className="grid gap-2 text-sm text-muted-foreground">
        <p>
          On Android, open the Chrome menu and choose Install app or Add to Home screen to keep {APP_NAME} on your phone.
        </p>
        <Button type="button" variant="ghost" className="h-11! w-fit px-0" onClick={signOut}>
          Sign out
        </Button>
      </section>
      </>
      ) : null}

      <Dialog open={editing} onOpenChange={(open) => !open && setEditor(null)}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editorTitle(editor)}</DialogTitle>
            <DialogDescription>{editorDescription(editor)}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="editor-name">{editor?.kind === "payment" ? "Nickname" : "Name"}</Label>
              <Input
                id="editor-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="h-12! text-base"
              />
            </div>
            {editor?.kind === "property" ? (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="editor-address">Address</Label>
                  <Input
                    id="editor-address"
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    placeholder="Optional"
                    className="h-12! text-base"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="editor-kind">Type</Label>
                    <select id="editor-kind" value={kind} onChange={(event) => setKind(event.target.value)} className="h-12 rounded-lg border border-border bg-background px-3 text-base">
                      <option value="primary">Primary</option>
                      <option value="rental">Rental</option>
                      <option value="vacation">Vacation</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="editor-status">Status</Label>
                    <select id="editor-status" value={homeStatus} onChange={(event) => setHomeStatus(event.target.value)} className="h-12 rounded-lg border border-border bg-background px-3 text-base">
                      <option value="active">Active</option>
                      <option value="upcoming">Upcoming</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="editor-purchase">Purchase date</Label>
                    <Input id="editor-purchase" type="date" value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} className="h-12! text-base" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="editor-role-date">Role changes on</Label>
                    <Input id="editor-role-date" type="date" value={roleStartsOn} onChange={(event) => setRoleStartsOn(event.target.value)} className="h-12! text-base" />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="editor-role">Becomes</Label>
                  <select id="editor-role" value={roleBecomes} onChange={(event) => setRoleBecomes(event.target.value)} className="h-12 rounded-lg border border-border bg-background px-3 text-base">
                    <option value="">No scheduled change</option>
                    <option value="primary">Primary</option>
                    <option value="rental">Rental</option>
                    <option value="vacation">Vacation</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="editor-notes">Notes</Label>
                  <Textarea
                    id="editor-notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    className="min-h-24 text-base"
                  />
                </div>
              </>
            ) : null}
            {editor?.kind === "category" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="editor-color">Color</Label>
                  <Input id="editor-color" type="color" value={color} onChange={(event) => setColor(event.target.value)} className="h-12!" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="editor-parent">Group</Label>
                  <select id="editor-parent" value={parentId} onChange={(event) => setParentId(event.target.value)} className="h-12 rounded-lg border border-border bg-background px-3 text-base">
                    <option value="">Top-level group</option>
                    {categories
                      .filter((category) => category.id !== (editor.mode === "edit" ? editor.item.id : ""))
                      .map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            ) : null}
            {editor?.kind === "payment" ? (
              <div className="grid gap-1.5">
                <Label htmlFor="editor-last4">Last 4</Label>
                <Input
                  id="editor-last4"
                  inputMode="numeric"
                  autoComplete="off"
                  value={last4}
                  onChange={(event) => setLast4(event.target.value)}
                  placeholder="Optional"
                  className="h-12! text-base"
                />
                <p className="text-xs text-muted-foreground">Four digits only. Leave blank for cash, check, or autopay.</p>
              </div>
            ) : null}
            {error && editor ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditor(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={saveEditor} disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={removing != null || editor?.kind === "samples"} onOpenChange={(open) => !open && setEditor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editor?.kind === "samples"
                ? "Clear sample expenses?"
                : removing
                  ? removing.item.expenseCount > 0
                    ? `${removing.item.title} is in use`
                    : `Delete ${removing.item.title}?`
                  : "Confirm"}
            </DialogTitle>
            <DialogDescription>
              {editor?.kind === "samples"
                ? "Only rows marked as samples are removed. Expenses you logged stay."
                : removing && removing.item.expenseCount > 0
                  ? `${removing.item.title} is on ${expensePhrase(removing.item.expenseCount)}, so it can’t be deleted yet. Archive it to hide it from new expenses, or move those expenses and then delete it.`
                  : "This removes it from the list. Expenses are not changed."}
            </DialogDescription>
          </DialogHeader>
          {removing && removing.item.expenseCount > 0 ? (
            removeChoices.length > 0 ? (
              <div className="grid gap-1.5">
                <Label htmlFor="reassign-target">Move expenses to</Label>
                <ChoiceSelect
                  id="reassign-target"
                  value={reassignTo}
                  onChange={setReassignTo}
                  options={removeChoices.map((choice) => ({ value: choice.id, label: choice.label }))}
                  placeholder={`Choose a ${NOUN[removing.kind]}`}
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Add another {NOUN[removing.kind]} before these expenses can be moved.
              </p>
            )
          ) : null}
          {error && editor ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditor(null)}>
              Cancel
            </Button>
            {removing && removing.item.expenseCount > 0 ? (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  void setArchived(removing.kind, removing.item.id, true).then((ok) => {
                    if (ok) setEditor(null);
                  });
                }}
              >
                Archive
              </Button>
            ) : null}
            {editor?.kind === "samples" || (removing && removing.item.expenseCount === 0) || (removing && removeChoices.length > 0) ? (
              <Button
                type="button"
                className="bg-none! bg-coral-ink! text-white!"
                onClick={saveEditor}
                disabled={pending || (removing != null && removing.item.expenseCount > 0 && !reassignTo)}
              >
                {pending
                  ? "Working…"
                  : editor?.kind === "samples"
                    ? "Clear samples"
                    : removing && removing.item.expenseCount > 0
                      ? "Move and delete"
                      : "Delete"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CatalogSection({
  title,
  description,
  addLabel,
  rows,
  pending,
  onAdd,
  onEdit,
  onArchive,
  onRemove,
  onMove,
}: {
  title: string;
  description: string;
  addLabel: string;
  rows: Row[];
  pending: boolean;
  onAdd: () => void;
  onEdit: (id: string) => void;
  onArchive: (id: string, archived: boolean) => void;
  onRemove: (row: Row) => void;
  onMove: (id: string, direction: -1 | 1) => void;
}) {
  const active = rows.filter((row) => !row.archived).sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
  const archived = rows.filter((row) => row.archived).sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
  return (
    <section className="grid gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <Button type="button" variant="outline" className="h-10! shrink-0" onClick={onAdd}>
          {addLabel}
        </Button>
      </div>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">Nothing here yet.</p> : null}
      <RowGroup rows={active} pending={pending} onEdit={onEdit} onArchive={onArchive} onRemove={onRemove} onMove={onMove} />
      {archived.length > 0 ? (
        <div className="grid gap-2">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Archived</h3>
          <RowGroup rows={archived} pending={pending} onEdit={onEdit} onArchive={onArchive} onRemove={onRemove} onMove={onMove} />
        </div>
      ) : null}
    </section>
  );
}

function RowGroup({
  rows,
  pending,
  onEdit,
  onArchive,
  onRemove,
  onMove,
}: {
  rows: Row[];
  pending: boolean;
  onEdit: (id: string) => void;
  onArchive: (id: string, archived: boolean) => void;
  onRemove: (row: Row) => void;
  onMove: (id: string, direction: -1 | 1) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <ul className="grid gap-2">
      {rows.map((row, index) => (
        <li key={row.id} className="rounded-2xl bg-card px-3 py-3 ring-1 ring-foreground/10">
          <div className="flex items-start gap-1">
            {rows.length > 1 ? (
              <div className="grid shrink-0">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-10"
                  aria-label={`Move ${row.title} up`}
                  disabled={pending || index === 0}
                  onClick={() => onMove(row.id, -1)}
                >
                  <ChevronUp className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-10"
                  aria-label={`Move ${row.title} down`}
                  disabled={pending || index === rows.length - 1}
                  onClick={() => onMove(row.id, 1)}
                >
                  <ChevronDown className="size-4" />
                </Button>
              </div>
            ) : null}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{row.title}</p>
                {row.archived ? <Badge variant="secondary">Archived</Badge> : null}
              </div>
              {row.detail ? <p className="mt-1 text-sm text-muted-foreground">{row.detail}</p> : null}
              <p className="mt-1 text-xs text-muted-foreground">{expensePhrase(row.expenseCount)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" className="h-10!" onClick={() => onEdit(row.id)}>
                  Edit
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-10!"
                  disabled={pending}
                  onClick={() => onArchive(row.id, !row.archived)}
                >
                  {row.archived ? "Restore" : "Archive"}
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-10!" onClick={() => onRemove(row)}>
                  Delete
                </Button>
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function endpoint(kind: Kind, id: string, action?: "reassign" | "reorder"): string {
  const root = kind === "property" ? "properties" : kind === "category" ? "categories" : "payment-methods";
  if (action === "reorder") return `/api/v1/${root}/reorder`;
  if (action === "reassign") return `/api/v1/${root}/${id}/reassign`;
  return `/api/v1/${root}/${id}`;
}

function movedIds(rows: Row[], id: string, direction: -1 | 1): string[] | null {
  const active = rows.filter((row) => !row.archived).sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
  const archived = rows.filter((row) => row.archived).sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
  const group = active.some((row) => row.id === id) ? active : archived;
  const index = group.findIndex((row) => row.id === id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= group.length) return null;
  const copy = [...group];
  const [row] = copy.splice(index, 1);
  if (!row) return null;
  copy.splice(next, 0, row);
  const activeIds = group === active ? copy.map((item) => item.id) : active.map((item) => item.id);
  const archivedIds = group === archived ? copy.map((item) => item.id) : archived.map((item) => item.id);
  return [...activeIds, ...archivedIds];
}

function expensePhrase(count: number): string {
  return count === 1 ? "1 expense" : `${count} expenses`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function editorTitle(editor: Editor): string {
  if (!editor || editor.kind === "samples" || editor.mode === "remove") return "Edit";
  const noun = capitalize(NOUN[editor.kind]);
  return editor.mode === "create" ? `Add ${noun.toLowerCase()}` : `Edit ${noun.toLowerCase()}`;
}

function editorDescription(editor: Editor): string {
  if (editor?.kind === "property") return "Name is required. Address and notes are optional.";
  if (editor?.kind === "payment") return "Nickname and last 4 only. A full card or account number is rejected.";
  return "This name shows up when you log an expense.";
}
