import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db";
import { ServiceError } from "@/server/errors";
import { createBill } from "@/server/services/bills";
import { createMaster, deleteMaster, listMasters, mergeMaster, setActive, updateMaster } from "@/server/services/masters";
import { listProperties } from "@/server/services/properties";
import { seed } from "../prisma/seed";

const stamp = `master-${Date.now().toString(36)}`;

describe("configuration master tables", () => {
  afterAll(async () => {
    await prisma.bill.deleteMany({ where: { name: { contains: stamp } } });
    await prisma.payee.deleteMany({ where: { name: { contains: stamp } } });
    await prisma.property.deleteMany({ where: { name: { contains: stamp } } });
    await prisma.cardIssuer.deleteMany({ where: { name: { contains: stamp } } });
    await prisma.lookupLabel.deleteMany({ where: { label: { contains: stamp } } });
    await prisma.$disconnect();
  });

  it("creates, renames, hides inactive values, blocks an in-use delete, and merges", async () => {
    await seed(prisma);
    const household = await prisma.household.findFirstOrThrow();
    const property = await prisma.property.findFirstOrThrow({ where: { householdId: household.id, slug: "little-elm" } });
    const category = await prisma.category.findFirstOrThrow({ where: { householdId: household.id, slug: "electric" } });

    const cabin = await createMaster("homes", { name: `Cabin ${stamp}`, address: "1 Lake Rd", key: "vacation", status: "active" });
    expect(cabin.detail).toContain("Vacation");
    const renamed = await updateMaster("homes", cabin.id, { name: `Lake cabin ${stamp}` });
    expect(renamed.name).toBe(`Lake cabin ${stamp}`);
    await setActive("homes", cabin.id, false);
    const activeHomes = await listMasters("homes", { activeOnly: true });
    expect(activeHomes.some((row) => row.id === cabin.id)).toBe(false);
    const listed = await listProperties();
    expect(listed.find((row) => row.id === cabin.id)?.archived).toBe(true);
    await setActive("homes", cabin.id, true);

    const alpha = await createMaster("payees", { name: `Alpha ${stamp}`, last4: "4242" });
    const beta = await createMaster("payees", { name: `Beta ${stamp}` });
    const again = await createMaster("payees", { name: `alpha ${stamp}` });
    expect(again.id).toBe(alpha.id);
    await createBill({
      name: `Master bill ${stamp}`,
      payeeId: alpha.id,
      propertyId: property.id,
      categoryId: category.id,
      amount: "18.00",
      anchorDate: "2026-11-04",
      frequency: "monthly",
    });
    await expect(deleteMaster("payees", alpha.id)).rejects.toBeInstanceOf(ServiceError);
    await expect(deleteMaster("payees", alpha.id)).rejects.toMatchObject({ code: "in_use" });
    const merged = await mergeMaster("payees", alpha.id, beta.id);
    expect(merged.deleted).toBe(true);
    expect(merged.moved).toBeGreaterThan(0);
    const bill = await prisma.bill.findFirstOrThrow({ where: { name: `Master bill ${stamp}` } });
    expect(bill.payeeId).toBe(beta.id);

    const mode = (await listMasters("payment-modes")).find((row) => row.key === "check");
    expect(mode?.system).toBe(true);
    const labeled = await updateMaster("payment-modes", mode!.id, { name: "Paper check" });
    expect(labeled.key).toBe("check");
    expect(labeled.name).toBe("Paper check");
    await expect(deleteMaster("payment-modes", mode!.id)).rejects.toMatchObject({ code: "system" });
    await updateMaster("payment-modes", mode!.id, { name: "Check" });

    const custom = await createMaster("property-types", { name: `Lake house ${stamp}` });
    expect(custom.system).toBe(false);
    const issuer = await createMaster("issuers", { name: `Chase ${stamp}` });
    const activeIssuers = await listMasters("issuers", { activeOnly: true });
    expect(activeIssuers.some((row) => row.id === issuer.id)).toBe(true);
    await setActive("issuers", issuer.id, false);
    const still = await listMasters("issuers", { activeOnly: true });
    expect(still.some((row) => row.id === issuer.id)).toBe(false);

    const system = await listMasters("system");
    expect(system.some((row) => row.name === "Last business day" && row.system)).toBe(true);
    await expect(updateMaster("system", system[0]!.id, { name: "Nope" })).rejects.toMatchObject({ code: "system" });
  });
});
