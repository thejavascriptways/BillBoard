import { randomUUID } from "node:crypto";

import { Decimal } from "@/server/prisma-types";
import { MODELS, type Field, type Model, type Rel, modelOf } from "@/server/sheet/catalog";

export type Row = Record<string, unknown>;

/** Loose row returned to services. Relation arrays stay arrays so callbacks typecheck. */
export interface Doc {
  id: string;
  [key: string]: any;
  occurrences: Doc[];
  payments: Doc[];
  reminders: Doc[];
  monthEntries: Doc[];
  bill: Doc;
  payee: Doc | null;
  property: Doc;
  category: Doc;
  paymentMethod: Doc | null;
  creditCard: Doc | null;
  cardholder: Doc | null;
  person: Doc | null;
  parent: Doc | null;
  coveredBy: Doc | null;
}

type Change = (model: string, row: Row, op: "upsert" | "delete") => void;

export class UniqueError extends Error {
  constructor(fields: string[]) {
    super(`Unique constraint failed on the fields: (${fields.join(", ")})`);
    this.name = "UniqueError";
  }
}

export class NotFoundError extends Error {
  constructor(model: string) {
    super(`No ${model} found`);
    this.name = "NotFoundError";
  }
}

function lazy<T>(run: () => T): Promise<T> {
  let pending: Promise<T> | null = null;
  const start = () => (pending ??= Promise.resolve().then(run));
  const promise = {
    then(onFulfilled?: ((value: T) => unknown) | null, onRejected?: ((reason: unknown) => unknown) | null) {
      return start().then(onFulfilled, onRejected);
    },
    catch(onRejected?: ((reason: unknown) => unknown) | null) {
      return start().catch(onRejected);
    },
    finally(onFinally?: (() => void) | null) {
      return start().finally(onFinally);
    },
  };
  return promise as Promise<T>;
}

function num(value: unknown): number {
  if (value instanceof Decimal) return value.toNumber();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function same(left: unknown, right: unknown, mode?: string): boolean {
  if (left == null && right == null) return true;
  if (left == null || right == null) return false;
  if (left instanceof Date || right instanceof Date) return num(left instanceof Date ? left : new Date(String(left))) === num(right instanceof Date ? right : new Date(String(right)));
  if (left instanceof Decimal || right instanceof Decimal) return Math.abs(num(left) - num(right)) < 1e-9;
  if (typeof left === "boolean" || typeof right === "boolean") return Boolean(left) === Boolean(right);
  if (typeof left === "number" || typeof right === "number") return num(left) === num(right);
  if (mode === "insensitive") return String(left).toLowerCase() === String(right).toLowerCase();
  return String(left) === String(right);
}

function cmp(left: unknown, right: unknown): number {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  if (left instanceof Date || right instanceof Date || typeof left === "number" || typeof right === "number" || left instanceof Decimal || right instanceof Decimal) {
    return num(left) - num(right);
  }
  const a = String(left);
  const b = String(right);
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function asDate(value: unknown, day: boolean): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    if (!day) return new Date(value.getTime());
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return new Date(`${text}T00:00:00.000Z`);
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  if (!day) return parsed;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function coerce(field: Field | undefined, value: unknown): unknown {
  if (!field) return value;
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (field.kind === "decimal") return value instanceof Decimal ? value : new Decimal(value as string | number);
  if (field.kind === "date") return asDate(value, true);
  if (field.kind === "datetime") return asDate(value, false);
  if (field.kind === "int") return Math.trunc(Number(value));
  if (field.kind === "bool") {
    if (value === "false" || value === "FALSE") return false;
    return Boolean(value);
  }
  if (field.kind === "ints") {
    if (Array.isArray(value)) return value.map((item) => Math.trunc(Number(item)));
    return String(value)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => Math.trunc(Number(item)));
  }
  if (field.kind === "enum" || field.kind === "string") return String(value);
  return value;
}

function cloneValue(value: unknown): unknown {
  if (value instanceof Date) return new Date(value.getTime());
  if (value instanceof Decimal) return new Decimal(value);
  if (Array.isArray(value)) return value.slice();
  return value;
}

export function cloneRow(row: Row): Row {
  const copy: Row = {};
  for (const [key, value] of Object.entries(row)) copy[key] = cloneValue(value);
  return copy;
}

export class MemoryDb {
  private readonly tables = new Map<string, Row[]>();
  onChange: Change | null = null;
  household!: Delegate;
  property!: Delegate;
  category!: Delegate;
  paymentMethod!: Delegate;
  expense!: Delegate;
  person!: Delegate;
  vehicle!: Delegate;
  occupancyPeriod!: Delegate;
  payerSplit!: Delegate;
  payerSplitShare!: Delegate;
  reminderSetting!: Delegate;
  payee!: Delegate;
  cardIssuer!: Delegate;
  lookupLabel!: Delegate;
  bill!: Delegate;
  occurrence!: Delegate;
  payment!: Delegate;
  creditCard!: Delegate;
  monthEntry!: Delegate;
  ledgerMonth!: Delegate;
  auditLog!: Delegate;
  householdPrefs!: Delegate;
  pluginState!: Delegate;
  reminderDelivery!: Delegate;

  constructor() {
    for (const model of MODELS) {
      this.tables.set(model.delegate, []);
      (this as unknown as Record<string, Delegate>)[model.delegate] = createDelegate(this, model);
    }
  }

  rows(delegate: string): Row[] {
    return this.tables.get(delegate) ?? [];
  }

  replaceRows(delegate: string, rows: Row[]): void {
    this.tables.set(delegate, rows.map((row) => this.materialize(modelOf(delegate), row)));
  }

  snapshot(): Record<string, Row[]> {
    const out: Record<string, Row[]> = {};
    for (const [delegate, rows] of this.tables) out[delegate] = rows.map(cloneRow);
    return out;
  }

  materialize(model: Model, input: Row): Row {
    const row: Row = {};
    for (const [key, field] of Object.entries(model.fields)) {
      const value = input[key];
      if (value === undefined) row[key] = field.default === undefined ? null : cloneValue(field.default);
      else row[key] = coerce(field, value);
    }
    return row;
  }

  pkOf(model: Model, row: Row): string {
    return String(row[model.pk] ?? "");
  }

  private findPk(delegate: string, id: unknown): Row | null {
    if (id == null || id === "") return null;
    const model = modelOf(delegate);
    return this.rows(delegate).find((row) => same(row[model.pk], id)) ?? null;
  }

  private matches(model: Model, row: Row, where: Record<string, unknown> | undefined): boolean {
    if (!where) return true;
    if (Array.isArray(where.AND) && !where.AND.every((part) => this.matches(model, row, part as Record<string, unknown>))) return false;
    if (where.AND && !Array.isArray(where.AND) && typeof where.AND === "object" && !this.matches(model, row, where.AND as Record<string, unknown>)) return false;
    if (Array.isArray(where.OR) && (where.OR.length === 0 || !where.OR.some((part) => this.matches(model, row, part as Record<string, unknown>)))) return false;
    if (where.NOT) {
      const parts = Array.isArray(where.NOT) ? where.NOT : [where.NOT];
      if (parts.some((part) => this.matches(model, row, part as Record<string, unknown>))) return false;
    }
    for (const [key, expected] of Object.entries(where)) {
      if (key === "AND" || key === "OR" || key === "NOT") continue;
      const unique = model.uniques.find((item) => item.name === key);
      if (unique && expected && typeof expected === "object") {
        for (const field of unique.fields) {
          if (!same(row[field], (expected as Row)[field])) return false;
        }
        continue;
      }
      const relation = model.relations[key];
      if (relation) {
        if (!this.matchRelation(model, row, relation, expected)) return false;
        continue;
      }
      if (!matchScalar(row[key], expected)) return false;
    }
    return true;
  }

  private matchRelation(model: Model, row: Row, relation: Rel, expected: unknown): boolean {
    if (relation.kind === "one") {
      const related = relation.fk
        ? this.findPk(relation.model, row[relation.fk])
        : this.rows(relation.model).find((child) => same(child[relation.from ?? ""], row[model.pk])) ?? null;
      if (expected == null) return related == null;
      if (expected && typeof expected === "object" && "is" in (expected as Row)) {
        const is = (expected as Row).is;
        if (is == null) return related == null;
        return related != null && this.matches(modelOf(relation.model), related, is as Row);
      }
      if (expected && typeof expected === "object" && "isNot" in (expected as Row)) {
        const isNot = (expected as Row).isNot;
        if (isNot == null) return related != null;
        return related == null || !this.matches(modelOf(relation.model), related, isNot as Row);
      }
      return related != null && this.matches(modelOf(relation.model), related, expected as Row);
    }
    const children = this.rows(relation.model).filter((child) => same(child[relation.from ?? ""], row[model.pk]));
    const spec = (expected ?? {}) as Row;
    if (spec.some) return children.some((child) => this.matches(modelOf(relation.model), child, spec.some as Row));
    if (spec.none) return !children.some((child) => this.matches(modelOf(relation.model), child, spec.none as Row));
    if (spec.every) return children.every((child) => this.matches(modelOf(relation.model), child, spec.every as Row));
    return true;
  }

  private compare(model: Model, left: Row, right: Row, orderBy: unknown): number {
    const list = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const [key, direction] = Object.entries(item as Row)[0] ?? [];
      if (!key) continue;
      const desc = direction === "desc" || (direction && typeof direction === "object" && (direction as Row).sort === "desc");
      let delta = 0;
      const relation = model.relations[key];
      if (relation && direction && typeof direction === "object" && !("sort" in (direction as Row))) {
        const leftRelated = this.relatedOne(model, left, relation);
        const rightRelated = this.relatedOne(model, right, relation);
        delta = this.compare(modelOf(relation.model), leftRelated ?? {}, rightRelated ?? {}, direction);
      } else {
        delta = cmp(left[key], right[key]);
      }
      if (delta !== 0) return desc ? -delta : delta;
    }
    return 0;
  }

  private relatedOne(model: Model, row: Row, relation: Rel): Row | null {
    if (relation.kind !== "one") return null;
    if (relation.fk) return this.findPk(relation.model, row[relation.fk]);
    return this.rows(relation.model).find((child) => same(child[relation.from ?? ""], row[model.pk])) ?? null;
  }

  private present(model: Model, row: Row, args?: Query): Row {
    const base = cloneRow(row);
    const select = args?.select as Row | undefined;
    const include = args?.include as Row | undefined;
    if (!select && !include) return base;
    const out: Row = {};
    if (select) {
      for (const [key, spec] of Object.entries(select)) {
        if (!spec) continue;
        const relation = model.relations[key];
        if (relation) out[key] = this.presentRelation(model, row, relation, spec);
        else out[key] = base[key];
      }
      return out;
    }
    Object.assign(out, base);
    for (const [key, spec] of Object.entries(include ?? {})) {
      if (!spec) continue;
      const relation = model.relations[key];
      if (!relation) continue;
      out[key] = this.presentRelation(model, row, relation, spec);
    }
    return out;
  }

  private presentRelation(model: Model, row: Row, relation: Rel, spec: unknown): unknown {
    const nested = spec && typeof spec === "object" ? (spec as Query) : undefined;
    if (relation.kind === "one") {
      const related = this.relatedOne(model, row, relation);
      if (!related) return null;
      return this.present(modelOf(relation.model), related, nested);
    }
    let children = this.rows(relation.model).filter((child) => same(child[relation.from ?? ""], row[model.pk]));
    if (nested?.where) children = children.filter((child) => this.matches(modelOf(relation.model), child, nested.where));
    if (nested?.orderBy) children = children.slice().sort((a, b) => this.compare(modelOf(relation.model), a, b, nested.orderBy));
    return children.map((child) => this.present(modelOf(relation.model), child, nested));
  }

  private normalize(model: Model, data: Row): Row {
    const out: Row = {};
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;
      const relation = model.relations[key];
      if (relation?.kind === "one" && relation.fk && value && typeof value === "object") {
        const spec = value as Row;
        if ("connect" in spec) out[relation.fk] = (spec.connect as Row | undefined)?.id ?? null;
        else if (spec.disconnect) out[relation.fk] = null;
        continue;
      }
      const field = model.fields[key];
      out[key] = field ? coerce(field, value) : value;
    }
    return out;
  }

  private applyDefaults(model: Model, row: Row, creating: boolean): Row {
    const next = { ...row };
    if (creating && (next[model.pk] == null || next[model.pk] === "")) next[model.pk] = randomUUID();
    const now = new Date();
    for (const [key, field] of Object.entries(model.fields)) {
      if (next[key] === undefined || (creating && next[key] == null && field.default !== undefined && key !== model.pk)) {
        next[key] = field.default === undefined ? null : cloneValue(field.default);
      }
    }
    if (creating && model.fields.createdAt && next.createdAt == null) next.createdAt = now;
    if (model.hasUpdatedAt) next.updatedAt = next.updatedAt instanceof Date ? next.updatedAt : now;
    if (creating && model.delegate === "reminderDelivery" && next.sentAt == null) next.sentAt = now;
    return this.materialize(model, next);
  }

  private assertUnique(model: Model, row: Row, ignorePk?: string): void {
    const rows = this.rows(model.delegate);
    for (const unique of model.uniques) {
      if (unique.fields.some((field) => row[field] == null || row[field] === "")) continue;
      const clash = rows.find(
        (other) => this.pkOf(model, other) !== ignorePk && unique.fields.every((field) => same(other[field], row[field])),
      );
      if (clash) throw new UniqueError(unique.fields);
    }
  }

  query(model: Model, args?: Query): Row[] {
    let rows = this.rows(model.delegate).filter((row) => this.matches(model, row, args?.where));
    if (args?.orderBy) rows = rows.slice().sort((a, b) => this.compare(model, a, b, args.orderBy));
    const skip = args?.skip ?? 0;
    const take = args?.take ?? rows.length;
    return rows.slice(skip, skip + take).map((row) => this.present(model, row, args));
  }

  write(model: Model, op: "create" | "update" | "upsert" | "delete" | "updateMany" | "deleteMany", args: Query): unknown {
    if (op === "create") return this.insert(model, args);
    if (op === "update") return this.patch(model, args, true);
    if (op === "upsert") return this.upsert(model, args);
    if (op === "delete") return this.remove(model, args, true);
    if (op === "updateMany") return this.patch(model, args, false);
    return this.remove(model, args, false);
  }

  private insert(model: Model, args: Query): Row {
    const data = this.normalize(model, (args.data ?? {}) as Row);
    const row = this.applyDefaults(model, data, true);
    if (model.hasUpdatedAt && !(args.data as Row | undefined)?.updatedAt) row.updatedAt = new Date();
    this.assertUnique(model, row);
    this.rows(model.delegate).push(row);
    this.onChange?.(model.delegate, cloneRow(row), "upsert");
    return this.present(model, row, args);
  }

  private patch(model: Model, args: Query, single: boolean): Row | { count: number } {
    const matches = this.rows(model.delegate).filter((row) => this.matches(model, row, args.where));
    if (single && matches.length === 0) throw new NotFoundError(model.delegate);
    const data = this.normalize(model, (args.data ?? {}) as Row);
    const explicitUpdated = (args.data as Row | undefined)?.updatedAt;
    let count = 0;
    for (const current of matches) {
      if (single && count === 1) break;
      const next = this.materialize(model, { ...current, ...data, [model.pk]: current[model.pk] });
      if (model.fields.createdAt) next.createdAt = current.createdAt;
      if (model.hasUpdatedAt) next.updatedAt = explicitUpdated ? coerce(model.fields.updatedAt, explicitUpdated) : new Date();
      this.assertUnique(model, next, this.pkOf(model, current));
      const list = this.rows(model.delegate);
      const index = list.indexOf(current);
      list[index] = next;
      this.onChange?.(model.delegate, cloneRow(next), "upsert");
      count += 1;
      if (single) return this.present(model, next, args);
    }
    return { count };
  }

  private upsert(model: Model, args: Query): Row {
    const existing = this.rows(model.delegate).find((row) => this.matches(model, row, args.where));
    if (existing) return this.patch(model, { ...args, where: { [model.pk]: existing[model.pk] }, data: args.update }, true) as Row;
    return this.insert(model, { ...args, data: args.create });
  }

  private remove(model: Model, args: Query, single: boolean): Row | { count: number } {
    const list = this.rows(model.delegate);
    const matches = list.filter((row) => this.matches(model, row, args.where));
    if (single && matches.length === 0) throw new NotFoundError(model.delegate);
    const doomed = single ? matches.slice(0, 1) : matches;
    for (const row of doomed) {
      const index = list.indexOf(row);
      if (index >= 0) list.splice(index, 1);
      this.onChange?.(model.delegate, cloneRow(row), "delete");
    }
    if (single) return this.present(model, doomed[0], args);
    return { count: doomed.length };
  }

  async $transaction<T>(input: (tx: MemoryDb) => Promise<T>): Promise<T>;
  async $transaction(input: Promise<unknown>[]): Promise<unknown[]>;
  async $transaction<T>(input: ((tx: MemoryDb) => Promise<T>) | Promise<unknown>[]): Promise<T | unknown[]> {
    if (typeof input === "function") return input(this);
    const results: unknown[] = [];
    for (const item of input) results.push(await item);
    return results;
  }

  async $disconnect(): Promise<void> {}
}

type Query = {
  where?: Record<string, unknown>;
  data?: Record<string, unknown>;
  create?: Record<string, unknown>;
  update?: Record<string, unknown>;
  include?: Record<string, unknown>;
  select?: Record<string, unknown>;
  orderBy?: unknown;
  take?: number;
  skip?: number;
  by?: string[];
  _count?: { _all?: boolean };
  _max?: Record<string, boolean>;
};

export type Delegate = {
  findMany(args?: Query): Promise<any[]>;
  findFirst(args?: Query): Promise<any>;
  findFirstOrThrow(args?: Query): Promise<any>;
  findUnique(args?: Query): Promise<any>;
  findUniqueOrThrow(args?: Query): Promise<any>;
  create(args: Query): Promise<any>;
  update(args: Query): Promise<any>;
  updateMany(args: Query): Promise<{ count: number }>;
  upsert(args: Query): Promise<any>;
  delete(args: Query): Promise<any>;
  deleteMany(args?: Query): Promise<{ count: number }>;
  count(args?: Query): Promise<number>;
  aggregate(args?: Query): Promise<any>;
  groupBy(args: Query): Promise<any[]>;
};

function matchScalar(value: unknown, expected: unknown): boolean {
  if (expected == null || expected instanceof Date || expected instanceof Decimal || typeof expected !== "object") return same(value, expected);
  const filter = expected as Row;
  const mode = typeof filter.mode === "string" ? filter.mode : undefined;
  if ("equals" in filter && !same(value, filter.equals, mode)) return false;
  if ("in" in filter && !((filter.in as unknown[]) ?? []).some((item) => same(value, item, mode))) return false;
  if ("notIn" in filter && ((filter.notIn as unknown[]) ?? []).some((item) => same(value, item, mode))) return false;
  if ("lt" in filter && !(cmp(value, filter.lt) < 0)) return false;
  if ("lte" in filter && !(cmp(value, filter.lte) <= 0)) return false;
  if ("gt" in filter && !(cmp(value, filter.gt) > 0)) return false;
  if ("gte" in filter && !(cmp(value, filter.gte) >= 0)) return false;
  if ("contains" in filter) {
    if (value == null) return false;
    const hay = String(value);
    const needle = String(filter.contains);
    const ok = mode === "insensitive" ? hay.toLowerCase().includes(needle.toLowerCase()) : hay.includes(needle);
    if (!ok) return false;
  }
  if ("startsWith" in filter) {
    if (value == null) return false;
    const hay = String(value);
    const needle = String(filter.startsWith);
    const ok = mode === "insensitive" ? hay.toLowerCase().startsWith(needle.toLowerCase()) : hay.startsWith(needle);
    if (!ok) return false;
  }
  if ("endsWith" in filter) {
    if (value == null) return false;
    const hay = String(value);
    const needle = String(filter.endsWith);
    const ok = mode === "insensitive" ? hay.toLowerCase().endsWith(needle.toLowerCase()) : hay.endsWith(needle);
    if (!ok) return false;
  }
  if ("not" in filter) {
    if (filter.not && typeof filter.not === "object" && "in" in (filter.not as Row)) {
      if (((filter.not as Row).in as unknown[]).some((item) => same(value, item, mode))) return false;
    } else if (same(value, filter.not, mode)) return false;
  }
  return true;
}

function createDelegate(db: MemoryDb, model: Model): Delegate {
  return {
    findMany: (args) => lazy(() => db.query(model, args) as any[]),
    findFirst: (args) => lazy(() => db.query(model, { ...args, take: 1 })[0] ?? null),
    findFirstOrThrow: (args) =>
      lazy(() => {
        const row = db.query(model, { ...args, take: 1 })[0];
        if (!row) throw new NotFoundError(model.delegate);
        return row;
      }),
    findUnique: (args) => lazy(() => db.query(model, args)[0] ?? null),
    findUniqueOrThrow: (args) =>
      lazy(() => {
        const row = db.query(model, args)[0];
        if (!row) throw new NotFoundError(model.delegate);
        return row;
      }),
    create: (args) => lazy(() => db.write(model, "create", args)),
    update: (args) => lazy(() => db.write(model, "update", args)),
    updateMany: (args) => lazy(() => db.write(model, "updateMany", args) as { count: number }),
    upsert: (args) => lazy(() => db.write(model, "upsert", args)),
    delete: (args) => lazy(() => db.write(model, "delete", args)),
    deleteMany: (args) => lazy(() => db.write(model, "deleteMany", args ?? {}) as { count: number }),
    count: (args) => lazy(() => db.query(model, args).length),
    aggregate: (args) =>
      lazy(() => {
        const rows = db.query(model, { where: args?.where });
        const max: Record<string, number | null> = {};
        for (const [field, on] of Object.entries(args?._max ?? {})) {
          if (!on) continue;
          const values = rows.map((row) => row[field]).filter((value) => value != null);
          max[field] = values.length === 0 ? null : values.reduce<number>((best, value) => Math.max(best, num(value)), num(values[0]));
        }
        return { _max: max, _count: { _all: rows.length } };
      }),
    groupBy: (args) =>
      lazy(() => {
        const rows = db.query(model, { where: args.where });
        const groups = new Map<string, { key: Row; count: number }>();
        for (const row of rows) {
          const key: Row = {};
          for (const field of args.by ?? []) key[field] = row[field];
          const token = JSON.stringify(key);
          const existing = groups.get(token);
          if (existing) existing.count += 1;
          else groups.set(token, { key, count: 1 });
        }
        return [...groups.values()].map((group) => ({ ...group.key, _count: { _all: group.count } }));
      }),
  };
}
