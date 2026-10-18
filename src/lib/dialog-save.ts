import { MASTER_TABLES, type MasterTableId } from "@/lib/masters";

/** Query flags that open a dialog. A successful save must drop them or the next refresh reopens it. */
export const DIALOG_OPEN_PARAMS = ["add", "merge", "new", "pay"] as const;

export type DialogSaveInput = {
  ok: boolean;
  message: string;
  search?: string;
};

export type DialogSavePlan =
  | { close: true; toast: string; search: string }
  | { close: false; error: string };

export type DialogSaveEffects = {
  close: () => void;
  refresh: () => void;
  notify: (message: string) => void;
  showError: (message: string) => void;
  replaceSearch?: (search: string) => void;
};

export type DialogActions = {
  close: () => void;
  unmount: () => void;
} | null;

export function masterNoun(table: MasterTableId): string {
  return MASTER_TABLES.find((item) => item.id === table)?.noun ?? "value";
}

export function masterDialogTitle(mode: "add" | "edit", table: MasterTableId): string {
  return `${mode === "add" ? "Add" : "Edit"} ${masterNoun(table)}`;
}

export function savedToast(noun: string): string {
  const label = noun.trim() || "Value";
  return `${label.charAt(0).toUpperCase()}${label.slice(1)} saved.`;
}

export function stripDialogOpenParams(search: string): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  for (const key of DIALOG_OPEN_PARAMS) params.delete(key);
  const next = params.toString();
  return next ? `?${next}` : "";
}

/**
 * Success closes the dialog, refreshes the list, and toasts.
 * A validation or server error leaves the dialog open and surfaces the message inline.
 */
export function planDialogSave(input: DialogSaveInput): DialogSavePlan {
  if (input.ok) {
    return {
      close: true,
      toast: input.message,
      search: stripDialogOpenParams(input.search ?? ""),
    };
  }
  return { close: false, error: input.message.trim() || "Could not save." };
}

export function applyDialogSave(input: DialogSaveInput, effects: DialogSaveEffects): DialogSavePlan {
  const plan = planDialogSave(input);
  if (plan.close) {
    effects.replaceSearch?.(plan.search);
    effects.close();
    effects.notify(plan.toast);
    effects.refresh();
  } else {
    effects.showError(plan.error);
  }
  return plan;
}

/** Close the Base UI store as well as React state. `unmount` finishes the exit if the animation does not. */
export function dismissDialog(actions: DialogActions) {
  actions?.close();
  actions?.unmount();
}

export function forgetDialogQuery(): string {
  if (typeof window === "undefined") return "";
  const next = stripDialogOpenParams(window.location.search);
  const path = `${window.location.pathname}${next}`;
  if (`${window.location.pathname}${window.location.search}` !== path) {
    window.history.replaceState(null, "", path);
  }
  return next;
}
