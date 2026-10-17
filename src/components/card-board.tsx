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
import { formatMoney } from "@/lib/money";
import type { PropertyDTO } from "@/lib/types";

const empty = {
  issuer: "",
  nickname: "",
  last4: "",
  propertyId: "",
  creditLimit: "",
  currentBalance: "",
  statementDay: "15",
  dueDay: "10",
  minimumPayment: "",
  apr: "",
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
    api<{ people: { id: string; name: string }[] }>("/api/v1/people").then((data) => setPeople(data.people)).catch(() => undefined);
    api<{ properties: PropertyDTO[] }>("/api/v1/properties")
      .then((data) => {
        const openProperties = data.properties.filter((property) => !property.archived);
        setProperties(openProperties);
        setForm((current) => ({ ...current, propertyId: current.propertyId || openProperties[0]?.id || "" }));
      })
      .catch(() => undefined);
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
      creditLimit: card.creditLimit,
      currentBalance: card.currentBalance,
      statementDay: String(card.statementDay),
      dueDay: String(card.dueDay),
      minimumPayment: card.minimumPayment,
      apr: card.apr ?? "",
      autopay: card.autopay,
      cardholderId: card.cardholderId ?? "",
    });
  }

  async function save() {
    setError(null);
    const body = {
      ...form,
      statementDay: Number(form.statementDay),
      dueDay: Number(form.dueDay),
      apr: form.apr || null,
    };
    try {
      if (editing) await api(`/api/v1/cards/${editing}`, { method: "PATCH", body: JSON.stringify(body) });
      else await api("/api/v1/cards", { method: "POST", body: JSON.stringify(body) });
      setOpen(false);
      setEditing(null);
      setForm({ ...empty, propertyId: properties[0]?.id ?? "" });
      load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save the card.");
    }
  }

  const totalLimit = cards.reduce((sum, card) => sum + Number(card.creditLimit), 0);
  const totalBalance = cards.reduce((sum, card) => sum + Number(card.currentBalance), 0);
  const total = totalLimit > 0 ? Math.round((totalBalance / totalLimit) * 1000) / 10 : null;

  return (
    <div id="cards-page" className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl tracking-tight">Credit cards</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {total == null ? "Add a card to see utilization." : `${total}% used across these cards.`} Only the last 4 digits are stored.
          </p>
        </div>
        <select aria-label="Cardholder" value={cardholderId} onChange={(event) => setCardholderId(event.target.value)} className="h-11 rounded-lg border border-border bg-background px-2 text-sm">
          <option value="">All cardholders</option>
          {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
        </select>
        <Button type="button" className="h-11!" onClick={() => { setEditing(null); setOpen(true); }}>
          Add card
        </Button>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {cards.length === 0 && !open ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="font-medium">No cards yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">A card creates a monthly bill, so paying it works like any other due date.</p>
        </div>
      ) : null}
      <ul className="grid gap-3">
        {cards.filter((card) => !cardholderId || card.cardholderId === cardholderId).map((card) => (
          <li key={card.id} className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-medium">
                  {card.nickname} <span className="text-muted-foreground">••{card.last4}</span>
                </h2>
                <p className="text-sm text-muted-foreground">
                  {card.issuer} · {card.propertyName}
                  {card.autopay ? " · Autopay" : ""}
                </p>
              </div>
              <p className="text-2xl font-medium tabular-nums">{card.utilization == null ? "—" : `${card.utilization}%`}</p>
            </div>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-muted-foreground">Balance</dt>
                <dd>{formatMoney(card.currentBalance)} of {formatMoney(card.creditLimit)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Next statement</dt>
                <dd>{formatDisplayDate(card.nextStatement)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Next due</dt>
                <dd>{formatDisplayDate(card.nextDue)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Minimum</dt>
                <dd>{formatMoney(card.minimumPayment)}{card.apr ? ` · ${card.apr}% APR` : ""}</dd>
              </div>
            </dl>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-brand" style={{ width: `${Math.min(100, card.utilization ?? 0)}%` }} />
            </div>
            <div className="mt-3 flex gap-3 text-sm">
              {card.billId ? (
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
          className="grid gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <h2 className="sm:col-span-2 font-medium">{editing ? "Edit card" : "New card"}</h2>
          {(
            [
              ["issuer", "Issuer"],
              ["nickname", "Nickname"],
              ["last4", "Last 4"],
              ["creditLimit", "Credit limit"],
              ["currentBalance", "Current balance"],
              ["minimumPayment", "Minimum payment"],
              ["statementDay", "Statement day"],
              ["dueDay", "Payment due day"],
              ["apr", "APR (optional)"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="grid gap-1.5">
              <Label htmlFor={`card-${key}`}>{label}</Label>
              <Input
                id={`card-${key}`}
                value={form[key]}
                onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                className="h-12!"
              />
            </div>
          ))}
          <div className="grid gap-1.5">
            <Label htmlFor="card-holder">Cardholder</Label>
            <select id="card-holder" className="h-12 rounded-lg border border-border bg-background px-3" value={form.cardholderId} onChange={(event) => setForm((current) => ({ ...current, cardholderId: event.target.value }))}>
              <option value="">Shared / none</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>{person.name}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="card-property">Property</Label>
            <select id="card-property" className="h-12 rounded-lg border border-border bg-background px-3" value={form.propertyId} onChange={(event) => setForm((current) => ({ ...current, propertyId: event.target.value }))}>
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={form.autopay} onChange={(event) => setForm((current) => ({ ...current, autopay: event.target.checked }))} />
            Autopay
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" className="h-11!">
              Save card
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
