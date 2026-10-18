"use client";

import { useEffect, useState } from "react";

import { ApiError, api } from "@/lib/api-client";
import type { MasterRow, MasterTableId } from "@/lib/masters";

const selectClass = "h-11 w-full rounded-lg border border-border bg-background px-3 text-sm";

export function MasterSelect({
  id,
  table,
  value,
  onChange,
  valueField = "id",
  creatable = true,
  emptyLabel,
  required,
  className,
  currentLabel,
}: {
  id?: string;
  table: MasterTableId;
  value: string;
  onChange: (value: string) => void;
  valueField?: "id" | "key" | "name";
  creatable?: boolean;
  emptyLabel?: string;
  required?: boolean;
  className?: string;
  currentLabel?: string;
}) {
  const [rows, setRows] = useState<MasterRow[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  function load() {
    api<{ rows: MasterRow[] }>(`/api/v1/masters?table=${table}`)
      .then((data) => setRows(data.rows))
      .catch(() => setRows([]));
  }

  useEffect(() => {
    load();
    // The fetch is tied to the table, not to the load function identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- table identity
  }, [table]);

  const field = (row: MasterRow) => (valueField === "key" ? row.key : valueField === "name" ? row.name : row.id);
  const visible = rows.filter((row) => row.isActive || field(row) === value);
  const known = visible.some((row) => field(row) === value);

  async function add() {
    setError(null);
    try {
      const result = await api<{ row: MasterRow }>("/api/v1/masters", {
        method: "POST",
        body: JSON.stringify({ table, name: draft }),
      });
      setRows((current) => [...current, result.row]);
      onChange(field(result.row));
      setDraft("");
      setAdding(false);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not add that.");
    }
  }

  return (
    <div className="grid gap-1">
      <select
        id={id}
        className={className ?? selectClass}
        required={required}
        value={adding ? "__new__" : value}
        onChange={(event) => {
          if (event.target.value === "__new__") {
            setAdding(true);
            return;
          }
          setAdding(false);
          onChange(event.target.value);
        }}
      >
        {emptyLabel != null ? <option value="">{emptyLabel}</option> : null}
        {visible.map((row) => (
          <option key={row.id} value={field(row)}>
            {row.isActive ? row.name : `${row.name} (inactive)`}
          </option>
        ))}
        {!known && value ? <option value={value}>{currentLabel ? `${currentLabel} (inactive)` : value}</option> : null}
        {creatable ? <option value="__new__">Add new…</option> : null}
      </select>
      {adding ? (
        <div className="flex gap-2">
          <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="New name" className={selectClass} aria-label={`New ${table}`} />
          <button type="button" className="h-11 rounded-lg bg-brand px-3 text-sm text-white" onClick={() => void add()}>
            Add
          </button>
        </div>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
