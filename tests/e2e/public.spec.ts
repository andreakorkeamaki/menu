import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("product landing page", () => {
  test("gives prospective restaurants a clear contact path", async ({ page }) => {
    await page.goto("/");

    const demoRequests = page.getByRole("link", { name: "Richiedi una demo", exact: true });
    await expect(demoRequests.first()).toBeVisible();
    await expect(demoRequests.first()).toHaveAttribute("href", "/richiedi-demo");
    await expect(page.getByRole("heading", { name: "Il materiale esiste già. Facciamolo lavorare meglio." })).toBeVisible();
    await expect(page.getByRole("link", { name: "ciao@menuinterattivo.it" })).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("turns interest into a structured, privacy-aware demo request", async ({ page }) => {
    await page.goto("/richiedi-demo");

    await expect(page.getByRole("heading", { name: "Vediamo il tuo ristorante, non una presentazione standard." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Richiedi una demo su misura" })).toBeVisible();
    await expect(page.getByLabel(/informativa privacy/)).toBeVisible();
    await expect(page.getByRole("link", { name: "informativa privacy" })).toHaveAttribute("href", "/privacy");

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe("account activation", () => {
  test("guides an invited owner through a strong, confirmed password", async ({ page }) => {
    await page.goto("/login/reset-password?mode=invite");

    await expect(page.getByRole("heading", { name: "Benvenuto in MenuInterattivo" })).toBeVisible();
    const password = page.getByLabel("Nuova password", { exact: true });
    const confirmation = page.getByLabel("Conferma password", { exact: true });
    await password.fill("PorticoSicuro2026");
    await confirmation.fill("PorticoSicuro2026");
    await expect(page.locator(".password-guidance .is-complete")).toHaveCount(4);
    await page.getByRole("button", { name: "Mostra" }).click();
    await expect(password).toHaveAttribute("type", "text");
    await expect(confirmation).toHaveAttribute("type", "text");
    await expect(page.getByRole("button", { name: "Entra nel mio ristorante" })).toBeVisible();

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

  test("helps guests filter for dietary needs without confusing allergens with suitability", async ({ page }) => {
    await page.goto("/r/demo");

    await page.getByRole("button", { name: "Senza glutine" }).click();
    await expect(page.getByText("Uovo, patata e tartufo", { exact: true })).toBeVisible();
    await expect(page.getByText("Tagliatelle al ragù", { exact: true })).toBeHidden();
    await expect(page.getByText("1 piatto trovato", { exact: true })).toBeVisible();

    await page.getByLabel("Escludi un allergene dichiarato").selectOption({ label: "Latte" });
    await expect(page.getByText("Nessun piatto corrisponde alla ricerca.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Azzera filtri" }).click();
    await expect(page.getByText("Tagliatelle al ragù", { exact: true })).toBeVisible();
    await expect(page.getByText(/rischio di contaminazione/)).toBeVisible();
  });

  test("keeps the primary menu actions available on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/r/demo");

    const mobileActions = page.locator(".public-mobile-actions");
    await expect(mobileActions.getByRole("link", { name: "Menu" })).toBeVisible();
    await expect(mobileActions.getByRole("link", { name: "Prenota" })).toBeVisible();
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

  test("serves a print-ready QR asset for the stable route", async ({ request }) => {
    const response = await request.get("/q/demo01/image?download=1");

    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/svg+xml");
    expect(response.headers()["content-disposition"]).toContain("attachment");
    expect(await response.text()).toContain("<svg");
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
