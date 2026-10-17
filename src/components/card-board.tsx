"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { scopeQuery, usePropertyScope } from "@/components/property-scope";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, api } from "@/lib/api-client";
import type { CardDTO } from "@/lib/bill-types";
import { formatDisplayDate } from "@/lib/dates";
import type { PropertyDTO } from "@/lib/types";

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
  const { propertyId, ready } = usePropertyScope();
  const [cards, setCards] = useState<CardDTO[]>([]);
  const [properties, setProperties] = useState<PropertyDTO[]>([]);
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [cardholderId, setCardholderId] = useState("");
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    if (!ready) return;
    api<{ cards: CardDTO[] }>(`/api/v1/cards${scopeQuery(propertyId)}`)
      .then((data) => setCards(data.cards))
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : "Could not load cards."));
  }

  useEffect(() => {
    const openForm = new URLSearchParams(window.location.search).get("new") === "1";
    const timer = openForm ? setTimeout(() => setOpen(true), 0) : undefined;
    api<{ people: { id: string; name: string }[] }>("/api/v1/people").then((data) => setPeople(data.people)).catch(() => undefined);
    api<{ properties: PropertyDTO[] }>("/api/v1/properties")
      .then((data) => setProperties(data.properties.filter((property) => !property.archived)))
      .catch(() => undefined);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- home filter
  }, [propertyId, ready]);

  function edit(card: CardDTO) {
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
    setError(null);
    const body = {
      issuer: form.issuer,
      nickname: form.nickname,
      last4: form.last4,
      propertyId: form.propertyId || null,
      statementDay: form.statementDay || null,
      dueDay: form.dueDay || null,
      autopay: form.autopay,
      cardholderId: form.cardholderId || null,
    };
    try {
      if (editing) await api(`/api/v1/cards/${editing}`, { method: "PATCH", body: JSON.stringify(body) });
      else await api("/api/v1/cards", { method: "POST", body: JSON.stringify(body) });
      setOpen(false);
      setEditing(null);
      setForm(empty);
      load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save the card.");
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
          {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
        </select>
        <Button type="button" className="h-11!" onClick={() => { setEditing(null); setForm(empty); setOpen(true); }}>
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
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <h2 className="font-medium sm:col-span-2">{editing ? "Edit card" : "New card"}</h2>
          <div className="grid gap-1.5">
            <Label htmlFor="card-issuer">Issuer</Label>
            <Input id="card-issuer" value={form.issuer} onChange={(event) => setForm((current) => ({ ...current, issuer: event.target.value }))} className="h-12!" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="card-nickname">Nickname</Label>
            <Input id="card-nickname" value={form.nickname} onChange={(event) => setForm((current) => ({ ...current, nickname: event.target.value }))} className="h-12!" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="card-last4">Last 4</Label>
            <Input id="card-last4" inputMode="numeric" autoComplete="off" required value={form.last4} onChange={(event) => setForm((current) => ({ ...current, last4: event.target.value }))} className="h-12!" />
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
            <select id="card-holder" className="h-12 rounded-lg border border-border bg-background px-3" value={form.cardholderId} onChange={(event) => setForm((current) => ({ ...current, cardholderId: event.target.value }))}>
              <option value="">None</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>{person.name}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="card-property">Property</Label>
            <select id="card-property" className="h-12 rounded-lg border border-border bg-background px-3" value={form.propertyId} onChange={(event) => setForm((current) => ({ ...current, propertyId: event.target.value }))}>
              <option value="">None</option>
              {properties.map((property) => (
                <option key={property.id} value={property.id}>{property.name}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={form.autopay} onChange={(event) => setForm((current) => ({ ...current, autopay: event.target.checked }))} />
            Autopay
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" className="h-11!">Save card</Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
