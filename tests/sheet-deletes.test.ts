import { describe, expect, it } from "vitest";

import { FakeDrive } from "@/server/sheet/backend";
import { SheetLedger } from "@/server/sheet/ledger";
import { MemoryDb } from "@/server/sheet/memory-db";

async function books() {
  const db = new MemoryDb();
  const drive = new FakeDrive();
  const folder = await drive.createFolder("BillBoard", null);
  const sheet = await drive.createSpreadsheet("BillBoard", folder.id);
  await drive.ensureTabs(sheet.id);
  const ledger = new SheetLedger(db, drive, sheet.id);
  const household = await db.household.create({ data: { name: "Singla household" } });
  await ledger.flush();
  return { db, drive, sheet, ledger, household };
}

function names(drive: FakeDrive, spreadsheetId: string, tab: string): string[] {
  const grid = drive.sheet(spreadsheetId, tab);
  const header = grid?.rows[0] ?? [];
  const column = header.indexOf("Name");
  return (grid?.rows.slice(1) ?? []).filter((row) => row.some((cell) => cell)).map((row) => row[column] ?? "");
}

describe("deletes reach the Google Sheet", () => {
  it("creates, updates, and removes the row, and a poll does not bring it back", async () => {
    const { db, drive, sheet, ledger, household } = await books();
    const elm = await db.property.create({ data: { householdId: household.id, slug: "little-elm", name: "Little Elm Home" } });
    const test = await db.property.create({ data: { householdId: household.id, slug: "test-home", name: "test home" } });
    const celina = await db.property.create({ data: { householdId: household.id, slug: "celina", name: "Celina Home" } });
    await ledger.flush();
    expect(names(drive, sheet.id, "Properties")).toEqual(["Little Elm Home", "test home", "Celina Home"]);

    await db.property.update({ where: { id: celina.id }, data: { name: "Celina New Build" } });
    await ledger.flush();
    expect(names(drive, sheet.id, "Properties")).toEqual(["Little Elm Home", "test home", "Celina New Build"]);

    await db.property.delete({ where: { id: test.id } });
    await ledger.flush();
    const grid = drive.sheet(sheet.id, "Properties");
    expect(grid?.rows).toHaveLength(3);
    expect(names(drive, sheet.id, "Properties")).toEqual(["Little Elm Home", "Celina New Build"]);
    expect(grid?.rows.flat()).not.toContain(test.id);

    await ledger.poll();
    await ledger.reload();
    const ids = (await db.property.findMany()).map((row) => row.id).sort();
    expect(ids).toEqual([elm.id, celina.id].sort());
    expect(ledger.pending).toBe(0);

    // The rows below the removed one moved up; later updates still land on the right row.
    await db.property.update({ where: { id: celina.id }, data: { name: "Celina Home" } });
    await ledger.flush();
    expect(names(drive, sheet.id, "Properties")).toEqual(["Little Elm Home", "Celina Home"]);
  });

  it("keeps a delete that has not reached the sheet yet when a poll runs first", async () => {
    const { db, drive, sheet, ledger, household } = await books();
    const test = await db.property.create({ data: { householdId: household.id, slug: "test-home", name: "test home" } });
    await ledger.flush();
    await db.property.delete({ where: { id: test.id } });
    drive.online = false;
    await ledger.flush();
    drive.online = true;
    await ledger.reload();
    expect(await db.property.findMany()).toHaveLength(0);
    expect(ledger.pending).toBe(1);
    await ledger.flush();
    expect(names(drive, sheet.id, "Properties")).toEqual([]);
    expect(ledger.pending).toBe(0);
  });

  it("removes old Deleted = true rows left by earlier builds", async () => {
    const { db, drive, sheet, ledger, household } = await books();
    const keep = await db.property.create({ data: { householdId: household.id, slug: "little-elm", name: "Little Elm Home" } });
    const old = await db.property.create({ data: { householdId: household.id, slug: "test-home", name: "test home" } });
    await ledger.flush();
    const header = drive.sheet(sheet.id, "Properties")?.rows[0] ?? [];
    const row = (drive.sheet(sheet.id, "Properties")?.rows ?? []).findIndex((values) => values.includes(old.id)) + 1;
    drive.editCell(sheet.id, "Properties", row, "Deleted", "true");
    expect(header).toContain("Deleted");
    await ledger.reload();
    expect((await db.property.findMany()).map((item) => item.id)).toEqual([keep.id]);
    await ledger.flush();
    expect(names(drive, sheet.id, "Properties")).toEqual(["Little Elm Home"]);
  });

  it("removes rows for other entities too, and deleteMany removes every match", async () => {
    const { db, drive, sheet, ledger, household } = await books();
    await db.person.create({ data: { householdId: household.id, name: "Deepak" } });
    const guest = await db.person.create({ data: { householdId: household.id, name: "Guest" } });
    await db.payee.create({ data: { householdId: household.id, name: "Atmos" } });
    await db.payee.create({ data: { householdId: household.id, name: "Old payee" } });
    await ledger.flush();
    await db.person.delete({ where: { id: guest.id } });
    await db.payee.deleteMany({ where: { name: "Old payee" } });
    await ledger.flush();
    expect(names(drive, sheet.id, "People")).toEqual(["Deepak"]);
    expect(names(drive, sheet.id, "Payees")).toEqual(["Atmos"]);
  });
});
