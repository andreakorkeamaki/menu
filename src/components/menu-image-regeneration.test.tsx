import { describe, expect, it } from "vitest";
import { menuImageRegenerationPayload } from "@/components/menu-image-regeneration";

describe("menuImageRegenerationPayload", () => {
  it("allows a blank note and preserves explicit tenant provenance", () => {
    expect(menuImageRegenerationPayload({
      itemId: "item",
      instructions: "   ",
      replaceAssetId: "asset",
      organizationId: "organization",
      menuId: "menu",
    })).toEqual({
      item_id: "item",
      instructions: "",
      replace_asset_id: "asset",
      organization_id: "organization",
      menu_id: "menu",
    });
  });
});
