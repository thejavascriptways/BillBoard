import { describe, expect, it } from "vitest";

import { FakeDrive } from "@/server/sheet/backend";
import { SheetLedger } from "@/server/sheet/ledger";
import { MemoryDb } from "@/server/sheet/memory-db";
import { copyFromSource } from "@/server/sheet/migrate";
import { FOLDER_MIME, SHEET_MIME } from "@/server/sheet/schema";

async function books() {
  const db = new MemoryDb();
  const drive = new FakeDrive();
  const folder = await drive.createFolder("BillBoard", null);
  const sheet = await drive.createSpreadsheet("BillBoard", folder.id);
  const backups = await drive.createFolder("Backups", folder.id);
  await drive.ensureTabs(sheet.id);
  const ledger = new SheetLedger(db, drive, sheet.id);
  const household = await db.household.create({ data: { name: "Singla household" } });
  return { db, drive, folder, sheet, backups, ledger, household };
}

describe("BillBoard spreadsheet", () => {
  it("creates the BillBoard folder, the spreadsheet inside it, and a Backups folder", async () => {
    const { drive, folder, sheet, backups } = await books();
    expect(folder.name).toBe("BillBoard");
    expect(folder.mimeType).toBe(FOLDER_MIME);
    expect(folder.parents).toEqual(["root"]);
    expect(sheet.name).toBe("BillBoard");
    expect(sheet.mimeType).toBe(SHEET_MIME);
    expect(sheet.parents).toEqual([folder.id]);
    expect(backups.name).toBe("Backups");
    expect(backups.parents).toEqual([folder.id]);
    const properties = drive.sheet(sheet.id, "Properties");
    expect(properties?.frozen).toBe(true);
    expect(properties?.boldHeader).toBe(true);
    expect(properties?.rows[0]?.[0]).toBe("Id");
    expect(properties?.validations.some((rule) => rule.header === "Kind" && rule.values?.includes("primary"))).toBe(true);
  });

  it("keeps the household and its prefs as two Settings rows", async () => {
    const { db, drive, sheet, ledger, household } = await books();
    await db.householdPrefs.create({ data: { householdId: household.id, reminderDays: [7, 3, 1, 0] } });
    await db.property.create({ data: { householdId: household.id, slug: "little-elm", name: "Little Elm Home" } });
    await ledger.flush();
    const settings = drive.sheet(sheet.id, "Settings");
    const types = (settings?.rows.slice(1) ?? []).map((row) => row[0]);
    expect(types).toEqual(expect.arrayContaining(["household", "prefs"]));
    const fresh = new MemoryDb();
    await new SheetLedger(fresh, drive, sheet.id).reload();
    expect((await fresh.household.findFirstOrThrow()).name).toBe("Singla household");
    expect((await fresh.householdPrefs.findUniqueOrThrow({ where: { householdId: household.id } })).reminderDays).toEqual([7, 3, 1, 0]);
    expect((await fresh.property.findFirstOrThrow()).name).toBe("Little Elm Home");
  });

  it("round-trips a property and keeps a human edit that did not touch updated at", async () => {
    const { db, drive, sheet, ledger } = await books();
    const created = await db.property.create({
      data: { householdId: String((await db.household.findFirstOrThrow()).id), slug: "little-elm", name: "Little Elm Home" },
    });
    await ledger.flush();
    const fresh = new MemoryDb();
    const again = new SheetLedger(fresh, drive, sheet.id);
    await again.reload();
    expect((await fresh.property.findFirstOrThrow()).name).toBe("Little Elm Home");

    drive.editCell(sheet.id, "Properties", 2, "Name", "Edited in the sheet");
    await ledger.poll();
    expect((await db.property.findFirstOrThrow()).name).toBe("Edited in the sheet");
    expect(created.id).toBe((await db.property.findFirstOrThrow()).id);
  });

  it("lets the newer updated at win, and a same-timestamp sheet edit win", async () => {
    const { db, drive, sheet, ledger } = await books();
    const household = await db.household.findFirstOrThrow();
    const property = await db.property.create({ data: { householdId: household.id, slug: "little-elm", name: "Little Elm Home" } });
    await ledger.flush();

    drive.editCell(sheet.id, "Properties", 2, "Name", "From sheet");
    drive.editCell(sheet.id, "Properties", 2, "Updated At", new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());
    await db.property.update({ where: { id: property.id }, data: { name: "From app" } });
    await ledger.poll();
    expect((await db.property.findFirstOrThrow()).name).toBe("From sheet");

    drive.editCell(sheet.id, "Properties", 2, "Name", "Older sheet");
    drive.editCell(sheet.id, "Properties", 2, "Updated At", "2000-01-01T00:00:00.000Z");
    await db.property.update({ where: { id: property.id }, data: { name: "From app again" } });
    await ledger.poll();
    expect((await db.property.findFirstOrThrow()).name).toBe("From app again");
  });

  it("skips an invalid row and records the sheet issue", async () => {
    const { db, drive, sheet, ledger } = await books();
    const household = await db.household.findFirstOrThrow();
    await db.property.create({ data: { householdId: household.id, slug: "little-elm", name: "Little Elm Home" } });
    await ledger.flush();
    const grid = drive.sheet(sheet.id, "Properties");
    const headers = grid?.rows[0] ?? [];
    grid?.rows.push(headers.map((header) => (header === "Id" ? "bad-row" : header === "Kind" ? "nope" : header === "Name" ? "Broken" : "")));
    await ledger.reload();
    expect(ledger.issues).toEqual([expect.objectContaining({ tab: "Properties", row: 3, problem: expect.stringContaining("Kind") })]);
    expect(await db.property.count()).toBe(1);
    expect((await db.property.findFirstOrThrow()).name).toBe("Little Elm Home");
  });

  it("queues writes while offline and flushes them when the sheet is reachable", async () => {
    const { db, drive, sheet, ledger } = await books();
    const household = await db.household.findFirstOrThrow();
    const property = await db.property.create({ data: { householdId: household.id, slug: "little-elm", name: "Little Elm Home" } });
    await ledger.flush();
    drive.online = false;
    await db.property.update({ where: { id: property.id }, data: { name: "Queued" } });
    await ledger.flush();
    expect(ledger.offline).toBe(true);
    expect(ledger.pending).toBeGreaterThan(0);
    expect(drive.sheet(sheet.id, "Properties")?.rows[1]?.[headersName(drive, sheet.id)]).toBe("Little Elm Home");
    drive.online = true;
    await ledger.flush();
    expect(ledger.pending).toBe(0);
    expect(drive.sheet(sheet.id, "Properties")?.rows[1]?.[headersName(drive, sheet.id)]).toBe("Queued");
  });

  it("retries a 429 and still writes the row", async () => {
    const { db, drive, sheet, ledger } = await books();
    const household = await db.household.findFirstOrThrow();
    await db.property.create({ data: { householdId: household.id, slug: "little-elm", name: "Little Elm Home" } });
    drive.failStatus = 429;
    await ledger.flush();
    expect(drive.sheet(sheet.id, "Properties")?.rows[1]?.[headersName(drive, sheet.id)]).toBe("Little Elm Home");
  });

  it("copies Postgres rows once and keeps relations on the second run", async () => {
    const target = new MemoryDb();
    const household = await target.household.create({ data: { name: "Singla household" } });
    const home = await target.property.create({ data: { householdId: household.id, slug: "little-elm", name: "Little Elm Home" } });
    const source = {
      household: [{ id: "pg-household", name: "Singla household", timezone: "America/Chicago", currency: "USD", createdAt: new Date().toISOString() }],
      property: [{ id: "pg-property", householdId: "pg-household", slug: "little-elm", name: "Little Elm Home", kind: "primary" }],
      expense: [
        {
          id: "pg-expense",
          householdId: "pg-household",
          propertyId: "pg-property",
          categoryId: "pg-category",
          paymentMethodId: "pg-method",
          payee: "City",
          amount: "42.00",
          expenseDate: "2026-04-01T00:00:00.000Z",
        },
      ],
    };
    const first = await copyFromSource(source, target);
    expect(first.property.created).toBe(0);
    expect(first.expense.created).toBe(1);
    expect(await target.property.count()).toBe(1);
    const expense = await target.expense.findFirstOrThrow();
    expect(expense.propertyId).toBe(home.id);
    const second = await copyFromSource(source, target);
    expect(second.property.created).toBe(0);
    expect(second.expense.created).toBe(0);
    expect(await target.property.count()).toBe(1);
    expect(await target.expense.count()).toBe(1);
    expect((await target.expense.findFirstOrThrow()).propertyId).toBe(home.id);
  });
});

function headersName(drive: FakeDrive, spreadsheetId: string): number {
  return drive.sheet(spreadsheetId, "Properties")?.rows[0]?.indexOf("Name") ?? -1;
}
