"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { scopeQuery, usePropertyScope } from "@/components/property-scope";
import { MasterSelect } from "@/components/master-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, api } from "@/lib/api-client";
import { cardDayValue, cardLast4Message, cardPropertyForSave } from "@/lib/card-form";
import { applyDialogSave, forgetDialogQuery } from "@/lib/dialog-save";
import type { CardDTO } from "@/lib/bill-types";
import { formatDisplayDate } from "@/lib/dates";

const empty = {
  issuer: "",
  nickname: "",
  last4: "",
  propertyId: "",
  statementDay: "",
  dueDay: "",
  autopay: false,
  cardholderId: "",
};

export function CardBoard() {
  const { propertyId, setPropertyId, ready } = usePropertyScope();
  const [cards, setCards] = useState<CardDTO[]>([]);
  const [people, setPeople] = useState<{ id: string; name: string; archived?: boolean }[]>([]);
  const [issuers, setIssuers] = useState<string[]>([]);
  const [cardholderId, setCardholderId] = useState("");
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const openedFromQuery = useRef(false);

  function load() {
    if (!ready) return;
    api<{ cards: CardDTO[] }>(`/api/v1/cards${scopeQuery(propertyId)}`)
      .then((data) => setCards(data.cards))
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : "Could not load cards."));
  }

  useEffect(() => {
    api<{ rows: { id: string; name: string; isActive: boolean }[] }>("/api/v1/masters?table=people").then((data) => setPeople(data.rows.map((row) => ({ id: row.id, name: row.name, archived: !row.isActive })))).catch(() => undefined);
    api<{ rows: { name: string; isActive: boolean }[] }>("/api/v1/masters?table=issuers&active=1").then((data) => setIssuers(data.rows.map((row) => row.name))).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!ready || openedFromQuery.current) return;
    if (new URLSearchParams(window.location.search).get("new") !== "1") return;
    const timer = window.setTimeout(() => {
      openedFromQuery.current = true;
      setEditing(null);
      setFormError(null);
      setForm({ ...empty, propertyId: propertyId !== "all" ? propertyId : "" });
      setOpen(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [ready, propertyId]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- home filter
  }, [propertyId, ready]);

  function edit(card: CardDTO) {
    setFormError(null);
    setEditing(card.id);
    setOpen(true);
    setForm({
      issuer: card.issuer,
      nickname: card.nickname,
      last4: card.last4,
      propertyId: card.propertyId,
      statementDay: card.statementDay == null ? "" : String(card.statementDay),
      dueDay: card.dueDay == null ? "" : String(card.dueDay),
      autopay: card.autopay,
      cardholderId: card.cardholderId ?? "",
    });
  }

  async function save() {
    const effects = {
      replaceSearch: () => forgetDialogQuery(),
      close: () => {
        forgetDialogQuery();
        setFormError(null);
        setOpen(false);
        setEditing(null);
        setForm(empty);
      },
      refresh: () => load(),
      notify: (message: string) => toast.success(message),
      showError: setFormError,
    };
    const last4Message = cardLast4Message(form.last4);
    if (last4Message) {
      applyDialogSave({ ok: false, message: last4Message }, effects);
      return;
    }
    const statement = cardDayValue(form.statementDay);
    const due = cardDayValue(form.dueDay);
    if (statement.message || due.message) {
      applyDialogSave({ ok: false, message: statement.message ?? due.message ?? "Check the days." }, effects);
      return;
    }
    const savedPropertyId = cardPropertyForSave(form.propertyId, propertyId);
    const body = {
      issuer: form.issuer.trim(),
      nickname: form.nickname.trim(),
      last4: form.last4.trim(),
      propertyId: savedPropertyId,
      statementDay: statement.day,
      dueDay: due.day,
      autopay: form.autopay,
      cardholderId: form.cardholderId || null,
    };
    try {
      const issuerName = form.issuer.trim();
      if (issuerName && !issuers.some((name) => name.toLowerCase() === issuerName.toLowerCase())) {
        await api("/api/v1/masters", { method: "POST", body: JSON.stringify({ table: "issuers", name: issuerName }) });
      }
      const result = editing
        ? await api<{ card: CardDTO }>(`/api/v1/cards/${editing}`, { method: "PATCH", body: JSON.stringify(body) })
        : await api<{ card: CardDTO }>("/api/v1/cards", { method: "POST", body: JSON.stringify(body) });
      applyDialogSave({ ok: true, message: editing ? "Card updated." : "Card saved.", search: window.location.search }, {
        ...effects,
        refresh: () => {
          const home = result.card.propertyId;
          if (propertyId !== "all" && home && home !== propertyId) {
            setPropertyId(home);
            return;
          }
          load();
        },
      });
    } catch (caught) {
      applyDialogSave(
        { ok: false, message: caught instanceof ApiError ? caught.message : "Could not save the card." },
        effects,
      );
    }
  }

  return (
    <div id="cards-page" className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl tracking-tight">Credit cards</h1>
          <p className="mt-1 text-sm text-muted-foreground">Only the last 4 digits are stored. A due day creates the monthly reminder.</p>
        </div>
        <select aria-label="Cardholder" value={cardholderId} onChange={(event) => setCardholderId(event.target.value)} className="h-11 rounded-lg border border-border bg-background px-2 text-sm">
          <option value="">All cardholders</option>
          {people.filter((person) => !person.archived || person.id === cardholderId).map((person) => <option key={person.id} value={person.id}>{person.archived ? `${person.name} (inactive)` : person.name}</option>)}
        </select>
        <Button type="button" className="h-11!" onClick={() => { setEditing(null); setForm({ ...empty, propertyId: propertyId !== "all" ? propertyId : "" }); setFormError(null); setOpen(true); }}>
          Add card
        </Button>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {cards.length === 0 && !open ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="font-medium">No cards yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">Add a card with its last 4 digits. Set a payment due day when you want a reminder.</p>
        </div>
      ) : null}
      <ul className="grid gap-3">
        {cards.filter((card) => !cardholderId || card.cardholderId === cardholderId).map((card) => (
          <li key={card.id} className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-medium">{card.displayName}</h2>
                <p className="text-sm text-muted-foreground">
                  {card.issuer ? `${card.issuer} · ` : ""}
                  {card.propertyName}
                  {card.cardholderName ? ` · ${card.cardholderName}` : ""}
                  {card.autopay ? " · Autopay" : ""}
                </p>
              </div>
            </div>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              {card.nextStatement ? (
                <div>
                  <dt className="text-muted-foreground">Next statement</dt>
                  <dd>{formatDisplayDate(card.nextStatement)}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-muted-foreground">Next due</dt>
                <dd>{card.nextDue ? formatDisplayDate(card.nextDue) : "Set a due day to start reminders"}</dd>
              </div>
            </dl>
            {card.paidBelowStatement ? <p className="mt-2 text-sm text-coral-ink">Paid below the statement. Balance carried.</p> : null}
            <div className="mt-3 flex gap-3 text-sm">
              {card.billId && card.dueDay ? (
                <Link href={`/bills/${card.billId}`} className="text-primary hover:underline">
                  Pay this card
                </Link>
              ) : null}
              <button type="button" className="text-primary" onClick={() => edit(card)}>
                Edit
              </button>
              <button
                type="button"
                className="text-muted-foreground"
                onClick={() => {
                  void api(`/api/v1/cards/${card.id}`, { method: "DELETE" }).then(load);
                }}
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
      {open ? (
        <form
          id="card-form"
          className="grid gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10 sm:grid-cols-2"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <h2 className="font-medium sm:col-span-2">{editing ? "Edit card" : "New card"}</h2>
          <div className="grid gap-1.5">
            <Label htmlFor="card-issuer">Issuer</Label>
            <Input id="card-issuer" list="card-issuers" value={form.issuer} onChange={(event) => setForm((current) => ({ ...current, issuer: event.target.value }))} className="h-12!" placeholder="Type or pick an issuer" />
            <datalist id="card-issuers">
              {issuers.map((name) => <option key={name} value={name} />)}
            </datalist>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="card-nickname">Nickname</Label>
            <Input id="card-nickname" value={form.nickname} onChange={(event) => setForm((current) => ({ ...current, nickname: event.target.value }))} className="h-12!" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="card-last4">Last 4</Label>
            <Input id="card-last4" inputMode="numeric" autoComplete="off" aria-invalid={Boolean(formError)} value={form.last4} onChange={(event) => setForm((current) => ({ ...current, last4: event.target.value }))} className="h-12!" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="card-statement">Statement day</Label>
            <Input id="card-statement" inputMode="numeric" value={form.statementDay} onChange={(event) => setForm((current) => ({ ...current, statementDay: event.target.value }))} className="h-12!" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="card-due">Payment due day</Label>
            <Input id="card-due" inputMode="numeric" value={form.dueDay} onChange={(event) => setForm((current) => ({ ...current, dueDay: event.target.value }))} className="h-12!" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="card-holder">Cardholder</Label>
            <MasterSelect id="card-holder" table="people" value={form.cardholderId} onChange={(value) => setForm((current) => ({ ...current, cardholderId: value }))} emptyLabel="None" className="h-12 w-full rounded-lg border border-border bg-background px-3" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="card-property">Property</Label>
            <MasterSelect id="card-property" table="homes" value={form.propertyId} onChange={(value) => setForm((current) => ({ ...current, propertyId: value }))} emptyLabel="None" className="h-12 w-full rounded-lg border border-border bg-background px-3" />
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={form.autopay} onChange={(event) => setForm((current) => ({ ...current, autopay: event.target.checked }))} />
            Autopay
          </label>
          {formError ? <p role="alert" className="text-sm text-destructive sm:col-span-2">{formError}</p> : null}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" className="h-11!">Save card</Button>
            <Button type="button" variant="outline" onClick={() => { forgetDialogQuery(); setFormError(null); setOpen(false); }}>Cancel</Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
