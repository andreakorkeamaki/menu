import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PublicationChanges } from "@/components/dashboard/publication-changes";

describe("PublicationChanges", () => {
  it("explains when publishing would only create a duplicate version", () => {
    const html = renderToStaticMarkup(<PublicationChanges diff={{
      firstPublication: false,
      hasChanges: false,
      addedItems: 0,
      removedItems: 0,
      updatedItems: 0,
      categoryChanges: 0,
      siteAndStyleChanges: 0,
      totalChanges: 0,
      draftCategoryCount: 2,
      draftItemCount: 10,
      changes: [],
    }} />);

    expect(html).toContain("Bozza e sito online coincidono");
    expect(html).toContain("Non serve creare una versione identica");
  });
});
