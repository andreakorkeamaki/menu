import { describe, expect, it } from "vitest";
import { DEMO_SNAPSHOT } from "@/lib/demo-data";
import { buildPublicationDiff } from "@/lib/publication-diff";
import type { PublicMenuSnapshot } from "@/types/domain";

function snapshot() {
  return structuredClone(DEMO_SNAPSHOT) as PublicMenuSnapshot;
}

describe("publication diff", () => {
  it("summarizes the complete first publication", () => {
    const draft = snapshot();
    const result = buildPublicationDiff(null, draft);
    const itemCount = draft.menu.categories.reduce((count, category) => count + category.items.length, 0);

    expect(result).toMatchObject({
      firstPublication: true,
      hasChanges: true,
      addedItems: itemCount,
      draftItemCount: itemCount,
      draftCategoryCount: draft.menu.categories.length,
    });
  });

  it("ignores publication metadata when the publishable experience is identical", () => {
    const current = snapshot();
    const draft = snapshot();
    draft.version = current.version + 1;
    draft.published_at = "2030-01-01T00:00:00.000Z";
    const localizedName = draft.menu.categories[0].items[0].name;
    draft.menu.categories[0].items[0].name = Object.fromEntries(
      Object.entries(localizedName).reverse(),
    ) as typeof localizedName;

    expect(buildPublicationDiff(current, draft)).toMatchObject({
      firstPublication: false,
      hasChanges: false,
      totalChanges: 0,
    });
  });

  it("makes risky menu and site changes explicit before publication", () => {
    const current = snapshot();
    const draft = snapshot();
    const changedItem = draft.menu.categories[0].items[0];
    changedItem.price += 2;
    changedItem.available = !changedItem.available;
    draft.location.phone = "+39 051 000000";
    draft.theme.accent = "#123456";
    draft.menu.active_locales = ["it", "en"];
    const removed = draft.menu.categories[0].items.pop();
    draft.menu.categories[1].items.push({
      ...structuredClone(changedItem),
      id: "new-item",
      name: { it: "Nuovo piatto" },
    });

    const result = buildPublicationDiff(current, draft);

    expect(result).toMatchObject({
      hasChanges: true,
      addedItems: 1,
      removedItems: removed ? 1 : 0,
      updatedItems: 1,
      siteAndStyleChanges: 3,
    });
    expect(result.changes.find((change) => change.label === changedItem.name.it)?.detail)
      .toContain("prezzo");
    expect(result.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Sito del ristorante" }),
      expect.objectContaining({ label: "Aspetto del sito" }),
      expect.objectContaining({ label: "Lingue pubblicate" }),
      expect.objectContaining({ label: "Nuovo piatto", kind: "added" }),
    ]));
  });
});
