import { afterAll, describe, expect, it } from "vitest";

import { decryptBackup } from "@/core/backup-crypto";
import { prisma } from "@/server/db";
import { buildBackup, exportEncrypted, restoreBackup } from "@/server/services/backup";
import { createBill, listPayments, payOccurrence, queryOccurrences } from "@/server/services/bills";
import { createCard } from "@/server/services/cards";
import { importWithPlugin } from "@/server/services/imports";
import { dispatchReminders } from "@/server/services/reminders";
import { seed } from "../prisma/seed";

const stamp = `mvp-${Date.now().toString(36)}`;

describe("mvp ledger", () => {
  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { bill: { name: { contains: stamp } } } });
    await prisma.creditCard.deleteMany({ where: { OR: [{ nickname: { contains: stamp } }, { last4: "4421", nickname: "" }] } });
    await prisma.bill.deleteMany({ where: { OR: [{ name: { contains: stamp } }, { name: "Card •••• 4421" }] } });
    await prisma.payee.deleteMany({ where: { name: { contains: stamp } } });
    await prisma.$disconnect();
  });

  it("records a recurring bill against a home, reminds once, marks it paid, and keeps history", async () => {
    await seed(prisma);
    const household = await prisma.household.findFirstOrThrow();
    const property = await prisma.property.findFirstOrThrow({ where: { householdId: household.id, slug: "little-elm" } });
    const category = await prisma.category.findFirstOrThrow({ where: { householdId: household.id, slug: "electric" } });
    const bill = await createBill({
      name: `Electric ${stamp}`,
      payeeName: `Oncor ${stamp}`,
      propertyId: property.id,
      categoryId: category.id,
      amount: "142.18",
      anchorDate: "2026-10-20",
      frequency: "monthly",
      dayOfMonth: 20,
      reminderDays: [3, 1, 0],
    });
    expect(bill.propertyName).toBe("Little Elm Home");
    const occurrences = await queryOccurrences({ from: "2026-10-01", to: "2026-12-31", q: stamp });
    expect(occurrences.some((row) => row.dueDate === "2026-11-20")).toBe(true);
    const due = occurrences.find((row) => row.dueDate === "2026-10-20");
    expect(due?.propertyName).toBe("Little Elm Home");

    const first = await dispatchReminders(new Date("2026-10-17T13:00:00.000Z"));
    const second = await dispatchReminders(new Date("2026-10-17T14:00:00.000Z"));
    const keys = new Set(first.notifications.map((item) => item.dedupeKey));
    expect([...keys].some((key) => key.includes("lead") || key.includes("due") || key.includes("digest"))).toBe(true);
    expect(second.notifications.filter((item) => keys.has(item.dedupeKey))).toHaveLength(0);

    const paid = await payOccurrence(due!.id, { amount: "50.00", confirmationNumber: "CONF-1", note: "partial" });
    expect(paid.status).toBe("partial");
    const full = await payOccurrence(due!.id, { confirmationNumber: "CONF-2" });
    expect(full.status).toBe("paid");
    const history = await listPayments({ billId: bill.id });
    expect(history.map((row) => row.confirmationNumber).sort()).toEqual(["CONF-1", "CONF-2"]);
  });

  it("adds a card from the last 4 digits and waits for a due day", async () => {
    const bare = await createCard({ last4: "4421" });
    expect(bare.displayName).toBe("Card •••• 4421");
    expect(bare.utilization).toBeNull();
    expect(bare.nextDue).toBeNull();
    expect(bare.billId).toBeTruthy();
    expect(await prisma.occurrence.count({ where: { billId: bare.billId! } })).toBe(0);

    const named = await createCard({
      issuer: "Chase",
      nickname: `Chase ${stamp}`,
      last4: "1001",
      statementDay: 15,
      dueDay: 10,
      autopay: true,
    });
    expect(named.displayName).toBe(`Chase ${stamp}`);
    expect(named.nextDue).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(await prisma.occurrence.count({ where: { billId: named.billId! } })).toBeGreaterThan(0);
    await expect(createCard({ last4: "4111111111111111" })).rejects.toMatchObject({ code: "invalid" });
  });

  it("restores an encrypted backup and imports the sample plugin", async () => {
    const before = await buildBackup();
    const file = await exportEncrypted("backup-pass-1");
    await expect(decryptBackup(file.bytes, "backup-pass-1")).resolves.toContain("Little Elm Home");
    const imported = await importWithPlugin(
      "sample-json-bills",
      JSON.stringify({
        bills: [
          {
            name: `Plugin water ${stamp}`,
            payee: `City ${stamp}`,
            amount: "68.40",
            dueDate: "2026-11-12",
            property: "Celina Home",
            category: "Water/Sewer",
            frequency: "monthly",
          },
        ],
      }),
    );
    expect(imported[0]?.propertyName).toBe("Celina Home");
    await restoreBackup(file.bytes, "backup-pass-1", "replace");
    const after = await prisma.bill.findFirst({ where: { name: `Plugin water ${stamp}` } });
    expect(after).toBeNull();
    expect(before.properties.some((row) => row.name === "Little Elm Home")).toBe(true);
  });
});
