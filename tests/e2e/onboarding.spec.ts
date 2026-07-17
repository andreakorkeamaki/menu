import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

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

  test("provisions, edits, translates, publishes and preserves the QR", async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "The stateful pilot runs once on desktop Chromium.");
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
    await operatorPage.goto("/dashboard");
    await expect(operatorPage).toHaveURL(/\/ops$/);
    await operatorPage.goto("/ops/new");

    await operatorPage.getByLabel("Organizzazione").fill("Ristorante pilota E2E SRL");
    await operatorPage.getByLabel("Nome pubblico").fill("Ristorante pilota E2E");
    await operatorPage.getByLabel("Città").fill("Bologna");
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
      "/dashboard",
    );
    await expect(ownerPage.getByRole("heading", { name: "Ristorante pilota E2E" })).toBeVisible();
    await ownerPage.goto("/ops/restaurants");
    await expect(ownerPage).toHaveURL(/\/dashboard$/);

    await ownerPage.goto("/dashboard/menu");
    const categoryForm = ownerPage.locator(".category-panel .inline-form");
    await categoryForm.getByLabel("Nome nuova categoria").fill("Dolci del test");
    await expect(ownerPage.getByText("1 riquadro da salvare")).toBeVisible();
    await categoryForm.getByRole("button", { name: "Aggiungi" }).click();
    await expect(ownerPage.getByRole("status")).toContainText("Categoria aggiunta in fondo");

    const dessertGroup = ownerPage.locator(".product-group").filter({
      has: ownerPage.getByRole("heading", { name: "Dolci del test", exact: true }),
    });
    await dessertGroup.getByLabel("Nome nuovo piatto in Dolci del test").fill("Torta del test");
    await dessertGroup.getByLabel("Prezzo").fill("7.50");
    await dessertGroup.getByRole("button", { name: "Aggiungi" }).click();
    await expect(ownerPage.getByRole("status")).toContainText("Piatto aggiunto in fondo");
    await ownerPage.goto("/dashboard/photos");
    const dessertCard = ownerPage.locator(".restaurant-photo-card").filter({
      has: ownerPage.getByRole("heading", { name: "Torta del test", exact: true }),
    });
    await expect(dessertCard).toBeVisible();
    await dessertCard.locator(".item-media-panel > summary").click();
    const dishPhoto = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 3,
        background: { r: 169, g: 94, b: 58 },
      },
    }).jpeg({ quality: 92 }).toBuffer();
    await dessertCard.locator('.item-media-upload input[type="file"]').setInputFiles({
      name: "torta-del-test.jpg",
      mimeType: "image/jpeg",
      buffer: dishPhoto,
    });
    await dessertCard.getByRole("button", { name: "Invia per la revisione" }).click();
    await expect(ownerPage.getByRole("status")).toContainText("Foto caricata nello spazio privato");

    const dishMediaOperatorContext = await browser.newContext();
    const dishMediaOperatorPage = await dishMediaOperatorContext.newPage();
    await signIn(
      dishMediaOperatorPage,
      credentials.operatorEmail!,
      credentials.operatorPassword!,
      "/ops/media",
    );
    const dishMediaCard = dishMediaOperatorPage.locator(".media-review-card")
      .filter({ hasText: "Ristorante pilota E2E" })
      .filter({ hasText: "Torta del test" });
    await expect(dishMediaCard).toBeVisible();
    await dishMediaCard.getByRole("button", { name: "Approva" }).click();
    await expect(dishMediaOperatorPage.getByRole("status")).toContainText("collegata alla bozza");
    await dishMediaOperatorContext.close();

    await ownerPage.goto("/dashboard");
    await ownerPage.getByRole("link", { name: /Rivedi le traduzioni/ }).click();
    await expect(ownerPage.getByRole("heading", { name: "Ogni lingua sotto controllo" })).toBeVisible();
    await ownerPage.getByRole("button", { name: "Genera tutte le righe idonee" }).click();
    const generationProgress = ownerPage.locator(".ai-progress");
    await expect(generationProgress).toBeVisible();
    await expect(generationProgress).toContainText(/Sto preparando|righe elaborate/);
    await expect(generationProgress).toContainText("Tempo trascorso");
    await expect(ownerPage.getByRole("status")).toContainText(/Generate \d+ bozze/);
    await expect(ownerPage.getByRole("alert")).toHaveCount(0);

    ownerPage.once("dialog", (dialog) => dialog.accept());
    await ownerPage.getByRole("button", { name: "Approva tutto" }).click();
    await expect(ownerPage.getByRole("status")).toContainText(/Approvate \d+ traduzioni/);

    await ownerPage.goto("/dashboard/photos");
    const approvedPhotoCard = ownerPage.locator(".restaurant-photo-card").filter({
      has: ownerPage.getByRole("heading", { name: "Torta del test", exact: true }),
    });
    await expect(approvedPhotoCard.getByText("Approvata", { exact: true })).toBeVisible();
    await ownerPage.goto("/dashboard/menu");
    await expect(ownerPage.locator('input[name="name"][value="Polpetta del test"]')).toBeVisible();
    await expect(ownerPage.getByRole("link", { name: "Apri la galleria foto →" })).toBeVisible();
    await ownerPage.getByRole("link", { name: "Controlla e pubblica" }).click();
    await expect(ownerPage.getByRole("heading", { name: "Controlla ciò che andrà online" })).toBeVisible();
    await expect(ownerPage.getByRole("heading", { name: "Pronta per la pubblicazione" })).toBeVisible();
    await expect(ownerPage.getByRole("heading", { name: "La prima versione completa" })).toBeVisible();
    await ownerPage.getByRole("link", { name: "Apri anteprima bozza ↗" }).click();
    await expect(ownerPage.getByLabel("Anteprima privata")).toContainText("Questa versione non è online");
    await expect(ownerPage.getByRole("heading", { level: 1, name: "Ristorante pilota E2E" })).toBeVisible();
    await expect(ownerPage.getByText("Polpetta del test", { exact: true })).toBeVisible();
    await expect(ownerPage.locator('script[type="application/ld+json"]')).toHaveCount(0);
    await ownerPage.getByTitle("Inglese").click();
    await expect(ownerPage).toHaveURL(/\/dashboard\/menu\/preview\?locale=en$/);
    await ownerPage.getByRole("link", { name: "Chiudi anteprima" }).click();
    await expect(ownerPage.getByRole("heading", { name: "Controlla ciò che andrà online" })).toBeVisible();
    await ownerPage.getByRole("button", { name: "Conferma e pubblica" }).click();
    await expect(ownerPage).toHaveURL(/\/dashboard\/menu\?published=1$/);

    await ownerPage.goto(`/r/${pilotSlug}`);
    await expect(ownerPage.getByRole("heading", { level: 1, name: "Ristorante pilota E2E" })).toBeVisible();
    await expect(ownerPage.getByText("Polpetta del test", { exact: true })).toBeVisible();
    await expect(ownerPage.getByText("Torta del test", { exact: true })).toBeVisible();
    await expect(ownerPage.locator(".public-menu-item").filter({ hasText: "Torta del test" }).locator("img")).toBeVisible();
    await ownerPage.goto(qrPath!);
    await expect(ownerPage).toHaveURL(new RegExp(`/r/${pilotSlug}$`));
    await expect(ownerPage.getByText("Polpetta del test", { exact: true })).toBeVisible();
    await expect(ownerPage.getByText("Torta del test", { exact: true })).toBeVisible();

    await ownerPage.goto("/dashboard/menu/review");
    await expect(ownerPage.getByRole("heading", { name: "Bozza e sito online coincidono" })).toBeVisible();
    await expect(ownerPage.getByRole("button", { name: "Versione già aggiornata" })).toBeDisabled();

    await ownerPage.goto("/dashboard/site");
    await expect(ownerPage.getByRole("link", { name: "Anteprima bozza ↗" })).toBeVisible();
    const themeEditor = ownerPage.locator(".accessible-theme-editor");
    await expect(themeEditor.getByText("AA leggibile")).toBeVisible();
    await themeEditor.getByLabel("Colore accento").fill("#f2c94c");
    await expect(themeEditor.getByText("Contrasto basso")).toBeVisible();
    await expect(themeEditor.getByRole("button", { name: "Salva tema accessibile" })).toBeDisabled();
    await themeEditor.getByLabel("Colore accento").fill("#9d3d2e");
    await expect(themeEditor.getByText("AA leggibile")).toBeVisible();
    const logoUpload = ownerPage.locator(".brand-upload-card").filter({ hasText: "Logo" });
    const logoImage = await sharp({
      create: {
        width: 320,
        height: 320,
        channels: 4,
        background: { r: 36, g: 61, b: 49, alpha: 1 },
      },
    }).png().toBuffer();
    await logoUpload.locator('input[type="file"]').setInputFiles({
      name: "logo-pilota.png",
      mimeType: "image/png",
      buffer: logoImage,
    });
    await expect(ownerPage.getByText("1 riquadro da salvare")).toBeVisible();
    await logoUpload.getByLabel("Testo descrittivo facoltativo").fill("Logo del ristorante pilota");
    await logoUpload.getByRole("button", { name: "Invia per la revisione" }).click();
    await expect(ownerPage.getByRole("status")).toContainText("spazio privato");
    await ownerContext.close();

    const mediaOperatorContext = await browser.newContext();
    const mediaOperatorPage = await mediaOperatorContext.newPage();
    await signIn(
      mediaOperatorPage,
      credentials.operatorEmail!,
      credentials.operatorPassword!,
      "/ops/media",
    );
    const mediaCard = mediaOperatorPage.locator(".media-review-card").filter({ hasText: "Ristorante pilota E2E" }).filter({ hasText: "Logo" });
    await expect(mediaCard).toBeVisible();
    await mediaCard.getByRole("button", { name: "Approva" }).click();
    await expect(mediaOperatorPage.getByRole("status")).toContainText("collegata alla bozza");
    await mediaOperatorContext.close();
  });
});
