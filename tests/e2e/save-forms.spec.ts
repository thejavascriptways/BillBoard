import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.locator("#password").fill(process.env.APP_PASSWORD ?? "");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

async function deleteTestCards(page: Page) {
  await page.evaluate(async () => {
    const data = (await fetch("/api/v1/cards").then((response) => response.json())) as {
      cards: { id: string; last4: string; nickname: string; issuer: string; displayName: string }[];
    };
    for (const card of data.cards ?? []) {
      const sample = card.last4 === "1234" && (card.nickname === "" || card.nickname.startsWith("Citi-Dpk") || card.issuer === "Citi" || card.displayName === "Card •••• 1234");
      if (sample) await fetch(`/api/v1/cards/${card.id}`, { method: "DELETE" });
    }
  });
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("saves a card from last 4 only, from a full form, and shows an inline error for 12a", async ({ page }) => {
  await page.goto("/cards");
  await deleteTestCards(page);
  await page.reload();
  await expect(page.locator('[aria-label="Property"] option', { hasText: "Little Elm Home" })).toHaveCount(1);
  await page.locator('[aria-label="Property"]').selectOption({ label: "Little Elm Home" });

  await page.getByRole("button", { name: "Add card" }).click();
  await expect(page.getByRole("heading", { name: "New card" })).toBeVisible();
  await page.locator("#card-last4").fill("12a");
  await page.getByRole("button", { name: "Save card" }).click();
  await expect(page.locator("#card-form [role=alert]")).toHaveText("Enter exactly 4 digits.");
  await expect(page.getByRole("heading", { name: "New card" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Add card" }).click();
  await expect(page.locator("#card-property option:checked")).toHaveText("Little Elm Home");
  await page.locator("#card-last4").fill("1234");
  await page.getByRole("button", { name: "Save card" }).click();
  await expect(page.locator("#card-form")).toHaveCount(0);
  await expect(page.getByText("Card saved.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Card •••• 1234" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Card •••• 1234" })).toBeVisible();
  const plain = await page.evaluate(async () => {
    const data = (await fetch("/api/v1/cards").then((response) => response.json())) as {
      cards: { displayName: string; last4: string; statementDay: number | null; dueDay: number | null; propertyName: string }[];
    };
    return data.cards.find((card) => card.displayName === "Card •••• 1234");
  });
  expect(plain).toMatchObject({ last4: "1234", statementDay: null, dueDay: null, propertyName: "Little Elm Home" });

  await page.getByRole("button", { name: "Add card" }).click();
  await page.locator("#card-issuer").fill("Citi");
  await page.locator("#card-nickname").fill("Citi-Dpk");
  await page.locator("#card-last4").fill("1234");
  await page.locator("#card-statement").fill("15");
  await page.locator("#card-due").fill("10");
  await page.locator("#card-property").selectOption({ label: "Personal" });
  await page.getByRole("button", { name: "Save card" }).click();
  await expect(page.locator("#card-form")).toHaveCount(0);
  await expect(page.getByText("Card saved.").last()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Citi-Dpk" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Citi-Dpk" })).toBeVisible();

  await page.locator("li", { hasText: "Citi-Dpk" }).getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { name: "Edit card", exact: true })).toBeVisible();
  await expect(page.locator("#card-last4")).toHaveValue("1234");
  await expect(page.locator("#card-statement")).toHaveValue("15");
  await expect(page.locator("#card-due")).toHaveValue("10");
  await expect(page.locator("#card-property option:checked")).toHaveText("Personal");
  await page.locator("#card-nickname").fill("Citi-Dpk Edited");
  await page.getByRole("button", { name: "Save card" }).click();
  await expect(page.locator("#card-form")).toHaveCount(0);
  await expect(page.getByText("Card updated.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Citi-Dpk Edited" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Citi-Dpk Edited" })).toBeVisible();

  const citi = await page.evaluate(async () => {
    const data = (await fetch("/api/v1/cards").then((response) => response.json())) as {
      cards: { nickname: string; issuer: string; last4: string; statementDay: number | null; dueDay: number | null; propertyName: string }[];
    };
    return data.cards.find((card) => card.nickname === "Citi-Dpk Edited");
  });
  expect(citi).toMatchObject({
    issuer: "Citi",
    last4: "1234",
    statementDay: 15,
    dueDay: 10,
    propertyName: "Personal",
  });

  await deleteTestCards(page);
});

async function deleteAuditRows(page: Page) {
  await page.evaluate(async () => {
    const bills = (await fetch("/api/v1/bills").then((response) => response.json())) as { bills: { id: string; name: string }[] };
    for (const bill of bills.bills ?? []) {
      if (bill.name.startsWith("Audit ")) await fetch(`/api/v1/bills/${bill.id}`, { method: "DELETE" });
    }
    const types = (await fetch("/api/v1/masters?table=utility-types").then((response) => response.json())) as { rows: { id: string; name: string }[] };
    for (const row of types.rows ?? []) {
      if (row.name.startsWith("Audit ")) {
        await fetch("/api/v1/masters", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ table: "utility-types", action: "delete", id: row.id }) });
      }
    }
    const homes = (await fetch("/api/v1/masters?table=homes").then((response) => response.json())) as { rows: { id: string; name: string }[] };
    for (const row of homes.rows ?? []) {
      if (row.name.startsWith("Audit ")) {
        await fetch("/api/v1/masters", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ table: "homes", action: "delete", id: row.id }) });
      }
    }
  });
}

test("save still works on utility, mark paid, configuration, and the bill form", async ({ page }) => {
  const stamp = `Audit ${Date.now().toString(36)}`;
  await deleteAuditRows(page);

  await page.goto("/configuration?table=homes");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Add home" })).toBeVisible();
  await page.locator("#master-name").fill(stamp);
  await page.locator("#master-form").getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "Add home" })).toHaveCount(0);
  await expect(page.getByText("Home saved.")).toBeVisible();
  await expect(page.getByText(stamp, { exact: true })).toBeVisible();

  await page.goto("/utilities");
  await expect.poll(async () => page.locator("#utility-home option").count()).toBeGreaterThan(1);
  await page.getByRole("button", { name: "Add utility" }).click();
  await expect(page.getByRole("heading", { name: "Add utility" })).toBeVisible();
  await page.locator("#utility-type").fill(stamp);
  await page.locator("#utility-due-day").fill("9");
  await expect.poll(async () => {
    const value = await page.locator("#utility-property").inputValue();
    return value && value !== "__new__" ? value : "";
  }).not.toBe("");
  await page.getByRole("button", { name: "Save utility" }).click();
  await expect(page.locator("#utility-form")).toHaveCount(0);
  await expect(page.getByText("Utility saved.")).toBeVisible();
  const utilityRow = page.locator("li", { hasText: stamp });
  await expect(utilityRow).toBeVisible();

  await utilityRow.getByRole("button", { name: "Mark paid" }).click();
  await expect(page.getByRole("heading", { name: "Mark paid" })).toBeVisible();
  await page.locator("#paid-amount").fill("15");
  await page.locator("#mark-paid-form").getByRole("button", { name: "Mark paid" }).click();
  await expect(page.locator("#mark-paid-form")).toHaveCount(0);
  await expect(page.getByText("Marked paid.")).toBeVisible();
  await expect(utilityRow.getByText(/Paid/)).toBeVisible();

  await page.goto("/bills/new");
  await page.locator("#bill-name").fill(stamp);
  await page.locator("#bill-amount").fill("12.50");
  await expect.poll(async () => {
    const value = await page.locator("#bill-property").inputValue();
    return value && value !== "__new__" ? value : "";
  }).not.toBe("");
  await expect.poll(async () => {
    const value = await page.locator("#bill-category").inputValue();
    return value && value !== "__new__" ? value : "";
  }).not.toBe("");
  await page.getByRole("button", { name: "Save bill" }).click();
  await page.waitForURL(/\/bills\/(?!new$)[^/]+$/);
  await expect(page.getByText("Bill saved.")).toBeVisible();
  await expect(page.getByRole("heading", { name: stamp })).toBeVisible();

  await deleteAuditRows(page);
});
