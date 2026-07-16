import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("product landing page", () => {
  test("gives prospective restaurants a clear contact path", async ({ page }) => {
    await page.goto("/");

    const demoRequests = page.getByRole("link", { name: "Richiedi una demo", exact: true });
    await expect(demoRequests.first()).toBeVisible();
    await expect(demoRequests.first()).toHaveAttribute("href", /^mailto:ciao@menuinterattivo\.it/);
    await expect(page.getByRole("heading", { name: "Il materiale esiste già. Facciamolo lavorare meglio." })).toBeVisible();
    await expect(page.getByRole("link", { name: "ciao@menuinterattivo.it" })).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe("public restaurant site", () => {
  test("renders the current Italian demo menu and filters dishes", async ({ page }) => {
    await page.goto("/r/demo");

    await expect(page.getByRole("heading", { level: 1, name: "Osteria del Portico" })).toBeVisible();
    await expect(page.getByText("Tagliatelle al ragù", { exact: true })).toBeVisible();

    await page.getByLabel("Cerca nel menu").fill("tartufo");
    await expect(page.getByText("Uovo, patata e tartufo", { exact: true })).toBeVisible();
    await expect(page.getByText("Tagliatelle al ragù", { exact: true })).toBeHidden();
  });

  test("switches language through stable localized routes", async ({ page }) => {
    await page.goto("/r/demo");
    await page.getByRole("link", { name: "EN", exact: true }).click();

    await expect(page).toHaveURL(/\/r\/demo\/en$/);
    await expect(page.locator(".public-site")).toHaveAttribute("lang", "en");
    await expect(page.getByText("Bolognese cooking, at its own pace.", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Main menu" })).toBeVisible();
    const tagliatelle = page.getByRole("article").filter({
      has: page.getByRole("heading", { level: 4, name: "Tagliatelle with traditional ragù" }),
    });
    await expect(tagliatelle).toBeVisible();
    await expect(page.getByText(/Flour, milk, lard, vegetables, squacquerone/)).toBeVisible();
    await expect(tagliatelle).toContainText("Gluten");
    await expect(tagliatelle).toContainText("Eggs");
    await expect(tagliatelle).toContainText("Celery");
    await expect(page.getByText("Mon–Fri", { exact: true })).toBeVisible();
  });

  test("keeps the printed QR route stable", async ({ page }) => {
    await page.goto("/q/demo01");

    await expect(page).toHaveURL(/\/r\/demo$/);
    await expect(page.getByRole("heading", { level: 1, name: "Osteria del Portico" })).toBeVisible();
  });

  test("gives guests a useful recovery path for a missing menu", async ({ page }) => {
    const response = await page.goto("/r/menu-non-esistente");

    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Questo menu non è più qui." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Apri il menu demo" })).toHaveAttribute("href", "/r/demo");

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("has no automatically detectable accessibility violations", async ({ page }) => {
    await page.goto("/r/demo");
    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
  });
});
