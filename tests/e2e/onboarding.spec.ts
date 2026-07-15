import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const credentials = {
  operatorEmail: process.env.E2E_OPERATOR_EMAIL,
  operatorPassword: process.env.E2E_OPERATOR_PASSWORD,
  ownerEmail: process.env.E2E_OWNER_EMAIL,
  ownerPassword: process.env.E2E_OWNER_PASSWORD,
};
const canRunPilot = Object.values(credentials).every(Boolean);
const pilotSlug = process.env.E2E_PILOT_SLUG ?? "e2e-ristorante-pilota";

async function signIn(page: Page, email: string, password: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Accedi" }).click();
}

test.describe("operator to owner pilot flow", () => {
  test.skip(!canRunPilot, "Set the four E2E operator/owner credential variables to run the real pilot flow.");

  test("provisions, imports, translates, publishes and preserves the QR", async ({ browser }) => {
    test.setTimeout(180_000);
    const operatorContext = await browser.newContext();
    const operatorPage = await operatorContext.newPage();
    await signIn(
      operatorPage,
      credentials.operatorEmail!,
      credentials.operatorPassword!,
      "/ops/new",
    );
    await expect(operatorPage.getByRole("heading", { name: "Crea un ristorante in pochi passaggi" }))
      .toBeVisible();

    await operatorPage.getByLabel("Organizzazione").fill("Ristorante pilota E2E SRL");
    await operatorPage.getByLabel("Nome pubblico").fill("Ristorante pilota E2E");
    await operatorPage.getByLabel("Slug pubblico").fill(pilotSlug);
    await operatorPage.getByLabel("Responsabile").fill("Proprietario pilota");
    await operatorPage.getByLabel("Email proprietario").fill(credentials.ownerEmail!);
    await operatorPage.getByRole("button", { name: "Crea e continua con i materiali" }).click();

    const provisioningStatus = operatorPage.getByRole("status");
    await expect(provisioningStatus).toContainText(/Ristorante creato|Provisioning già esistente/);
    const qrLink = provisioningStatus.getByRole("link", { name: /^\/q\// });
    const qrPath = await qrLink.getAttribute("href");
    expect(qrPath).toMatch(/^\/q\/[A-Z0-9]+$/);

    await operatorPage.getByLabel("Carica menu o documento").setInputFiles(
      path.join(process.cwd(), "tests/e2e/fixtures/pilot-menu.csv"),
    );
    await operatorPage.getByRole("button", { name: "Carica e analizza" }).click();
    await expect(operatorPage.getByRole("status")).toContainText("Materiale caricato e avviato con un solo job");
    await expect(operatorPage.getByText("Polpetta del test", { exact: true })).toBeVisible();
    await expect(operatorPage.getByText("Glutine", { exact: true })).toBeVisible();
    await expect(operatorPage.getByText(/Grande: \+ 3,00/)).toBeVisible();
    await operatorPage.getByRole("button", { name: "Approva e scrivi nella bozza" }).click();
    await expect(operatorPage.getByRole("status")).toContainText("Nulla è stato pubblicato");
    await operatorContext.close();

    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    await signIn(
      ownerPage,
      credentials.ownerEmail!,
      credentials.ownerPassword!,
      "/dashboard/translations",
    );
    await expect(ownerPage.getByRole("heading", { name: "Ogni lingua sotto controllo" })).toBeVisible();
    await ownerPage.getByRole("button", { name: "Genera tutte le righe idonee" }).click();
    await expect(ownerPage.getByRole("status")).toContainText(/Generate \d+ bozze/);
    await expect(ownerPage.getByRole("alert")).toHaveCount(0);

    const reviewRows = ownerPage.locator(".translation-editor-list article").filter({
      has: ownerPage.getByText("Da revisionare", { exact: true }),
    });
    while (await reviewRows.count()) {
      const row = reviewRows.first();
      const translation = row.getByLabel("Traduzione");
      await expect(translation).not.toHaveValue("");
      await row.getByRole("button", { name: "Approva", exact: true }).click();
      await expect(ownerPage.getByRole("status")).toContainText("Traduzione approvata");
    }

    await ownerPage.goto("/dashboard/menu");
    await expect(ownerPage.locator('input[name="name"][value="Polpetta del test"]')).toBeVisible();
    await ownerPage.getByRole("button", { name: "Controlla e pubblica" }).click();
    await expect(ownerPage).toHaveURL(/\/dashboard\/menu\?published=1$/);

    await ownerPage.goto(`/r/${pilotSlug}`);
    await expect(ownerPage.getByRole("heading", { level: 1, name: "Ristorante pilota E2E" })).toBeVisible();
    await expect(ownerPage.getByText("Polpetta del test", { exact: true })).toBeVisible();
    await ownerPage.goto(qrPath!);
    await expect(ownerPage).toHaveURL(new RegExp(`/r/${pilotSlug}$`));
    await expect(ownerPage.getByText("Polpetta del test", { exact: true })).toBeVisible();
    await ownerContext.close();
  });
});
