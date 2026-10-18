import { describe, expect, it } from "vitest";

import { applyDialogSave, masterDialogTitle, planDialogSave, stripDialogOpenParams } from "@/lib/dialog-save";

describe("dialog close on success", () => {
  it("closes, refreshes, and toasts after a successful save, and strips the query that would reopen the dialog", () => {
    const calls: string[] = [];
    const plan = applyDialogSave(
      { ok: true, message: "Home saved.", search: "?table=homes&add=1&merge=1" },
      {
        replaceSearch: (search) => calls.push(`search:${search}`),
        close: () => calls.push("close"),
        notify: (message) => calls.push(`toast:${message}`),
        refresh: () => calls.push("refresh"),
        showError: (message) => calls.push(`error:${message}`),
      },
    );

    expect(plan).toEqual({ close: true, toast: "Home saved.", search: "?table=homes" });
    expect(calls).toEqual(["search:?table=homes", "close", "toast:Home saved.", "refresh"]);
  });

  it("keeps the dialog open and reports the error inline when save fails", () => {
    const calls: string[] = [];
    const plan = applyDialogSave(
      { ok: false, message: "A category with that name already exists.", search: "?table=categories&add=1" },
      {
        replaceSearch: () => calls.push("search"),
        close: () => calls.push("close"),
        notify: () => calls.push("toast"),
        refresh: () => calls.push("refresh"),
        showError: (message) => calls.push(`error:${message}`),
      },
    );

    expect(plan.close).toBe(false);
    if (!plan.close) expect(plan.error).toBe("A category with that name already exists.");
    expect(calls).toEqual(["error:A category with that name already exists."]);
    expect(stripDialogOpenParams("?new=1&pay=1")).toBe("");
    expect(planDialogSave({ ok: false, message: "  " }).close).toBe(false);
  });

  it("uses a singular title for every master list", () => {
    expect(masterDialogTitle("add", "homes")).toBe("Add home");
    expect(masterDialogTitle("add", "utility-types")).toBe("Add utility type");
    expect(masterDialogTitle("edit", "categories")).toBe("Edit category");
    expect(masterDialogTitle("add", "payees")).toBe("Add provider");
    expect(masterDialogTitle("add", "payment-methods")).toBe("Add payment method");
    expect(masterDialogTitle("edit", "payment-modes")).toBe("Edit payment mode");
    expect(masterDialogTitle("add", "people")).toBe("Add person");
    expect(masterDialogTitle("add", "issuers")).toBe("Add card issuer");
    expect(masterDialogTitle("add", "property-types")).toBe("Add property type");
  });
});
