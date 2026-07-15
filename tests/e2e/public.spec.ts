import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

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
    await expect(page.getByText("Bolognese cooking, at its own pace.", { exact: true })).toBeVisible();
    await expect(page.getByText("Tagliatelle with traditional ragù", { exact: true })).toBeVisible();
  });

  test("keeps the printed QR route stable", async ({ page }) => {
    await page.goto("/q/demo01");

    await expect(page).toHaveURL(/\/r\/demo$/);
    await expect(page.getByRole("heading", { level: 1, name: "Osteria del Portico" })).toBeVisible();
  });

  test("has no automatically detectable accessibility violations", async ({ page }) => {
    await page.goto("/r/demo");
    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
  });
});
