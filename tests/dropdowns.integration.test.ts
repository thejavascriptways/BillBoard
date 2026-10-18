import { afterAll, describe, expect, it } from "vitest";

import { defaultHomeId } from "@/lib/homes";
import { prisma } from "@/server/db";
import { DROPDOWN_TABLES, loadDropdown } from "@/server/services/dropdowns";
import { linkLegacyMasters } from "@/server/services/link-legacy";
import { createMaster, deleteMaster, listMasters, updateMaster } from "@/server/services/masters";
import { listProperties } from "@/server/services/properties";
import { utilityCatalog } from "@/server/services/utilities";
import { seed } from "../prisma/seed";

const stamp = `drop-${Date.now().toString(36)}`;

describe("dropdowns use the configuration master tables", () => {
  afterAll(async () => {
    await prisma.creditCard.deleteMany({ where: { nickname: `Dropdown card ${stamp}` } });
    await prisma.cardIssuer.deleteMany({ where: { name: `Dropdown Visa ${stamp}` } });
    await prisma.category.deleteMany({ where: { name: { contains: stamp } } });
    await prisma.property.deleteMany({ where: { name: { contains: stamp } } });
    await prisma.$disconnect();
  });

  it("keeps a renamed home and utility type on every dropdown loader, and does not let seed rename them", async () => {
    await seed(prisma);
    const household = await prisma.household.findFirstOrThrow();
    const personal = await prisma.property.findFirstOrThrow({ where: { householdId: household.id, slug: "personal" } });
    const createdHome = await createMaster("homes", { name: `Cabin ${stamp}`, key: "vacation" });
    const createdType = await createMaster("utility-types", { name: `Power ${stamp}` });

    await updateMaster("homes", createdHome.id, { name: `Cabin renamed ${stamp}` });
    await updateMaster("utility-types", createdType.id, { name: `Power renamed ${stamp}` });
    await seed(prisma);

    const homes = await listMasters("homes");
    const homeChoices = await loadDropdown("homes");
    const propertyList = await listProperties();
    expect(homes.find((row) => row.id === createdHome.id)?.name).toBe(`Cabin renamed ${stamp}`);
    expect(homeChoices.find((row) => row.id === createdHome.id)?.name).toBe(`Cabin renamed ${stamp}`);
    expect(propertyList.find((row) => row.id === createdHome.id)?.name).toBe(`Cabin renamed ${stamp}`);
    expect(homes.some((row) => row.id === personal.id)).toBe(true);
    expect(homeChoices.some((row) => row.id === personal.id)).toBe(true);

    const types = await listMasters("utility-types");
    const typeChoices = await loadDropdown("utility-types");
    const catalog = await utilityCatalog();
    expect(types.find((row) => row.id === createdType.id)?.name).toBe(`Power renamed ${stamp}`);
    expect(typeChoices.find((row) => row.id === createdType.id)?.name).toBe(`Power renamed ${stamp}`);
    expect(catalog.types.find((row) => row.id === createdType.id)?.name).toBe(`Power renamed ${stamp}`);

    for (const table of DROPDOWN_TABLES) {
      const all = await listMasters(table);
      const choices = await loadDropdown(table);
      const ids = new Set(all.map((row) => row.id));
      expect(choices.every((row) => ids.has(row.id) && row.isActive)).toBe(true);
    }

    await updateMaster("homes", createdHome.id, { isActive: false });
    expect((await loadDropdown("homes")).some((row) => row.id === createdHome.id)).toBe(false);
    expect((await listMasters("homes")).some((row) => row.id === createdHome.id)).toBe(true);

    const anchor = await prisma.property.findFirstOrThrow({ where: { householdId: household.id, isActive: true } });
    await prisma.creditCard.create({
      data: {
        householdId: household.id,
        propertyId: anchor.id,
        issuer: `Dropdown Visa ${stamp}`,
        nickname: `Dropdown card ${stamp}`,
        last4: "4242",
      },
    });
    await linkLegacyMasters(prisma, household.id);
    expect((await listMasters("issuers")).some((row) => row.name === `Dropdown Visa ${stamp}`)).toBe(true);
    expect((await loadDropdown("issuers")).some((row) => row.name === `Dropdown Visa ${stamp}`)).toBe(true);

    await deleteMaster("utility-types", createdType.id);
  });

  it("picks the last used home id, then the first active home", () => {
    const homes = [
      { id: "b", sortOrder: 2, isActive: true },
      { id: "a", sortOrder: 0, isActive: false },
      { id: "c", sortOrder: 1, isActive: true },
    ];
    expect(defaultHomeId(homes, "b")).toBe("b");
    expect(defaultHomeId(homes, null)).toBe("c");
    expect(defaultHomeId(homes, "missing")).toBe("c");
    expect(defaultHomeId(homes, "all")).toBe("all");
  });
});
