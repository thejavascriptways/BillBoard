import { openLedgerStore } from "@/core/ledger-store";
import type { MemoryDb } from "@/server/sheet/memory-db";
import { getRuntime } from "@/server/sheet/runtime";

const runtime = getRuntime();

/**
 * Queries wait until boot finishes, but they stay lazy so $transaction
 * still runs the queued writes in order. Boot itself uses the raw client,
 * so seeding does not wait on this gate.
 */
function lazy<T>(run: () => Promise<T>): Promise<T> {
  let pending: Promise<T> | null = null;
  const start = () => (pending ??= run());
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

function gateClient(client: MemoryDb, ready: Promise<void>): MemoryDb {
  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === "function") {
        return (...args: unknown[]) =>
          lazy(async () => {
            await ready;
            return (value as (...inner: unknown[]) => unknown).apply(target, args);
          });
      }
      if (value && typeof value === "object") {
        return new Proxy(value, {
          get(delegate, method) {
            const fn = Reflect.get(delegate, method, delegate);
            if (typeof fn !== "function") return fn;
            return (...args: unknown[]) =>
              lazy(async () => {
                await ready;
                return (fn as (...inner: unknown[]) => unknown).apply(delegate, args);
              });
          },
        });
      }
      return value;
    },
  }) as MemoryDb;
}

const ready = runtime.boot();

/** In-memory ledger. Google Sheets is the source of truth once an account is connected. */
export const prisma = gateClient(runtime.client, ready);
export const dataRuntime = runtime;
export const ledger = openLedgerStore(prisma);
