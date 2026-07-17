import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("menu item media resolution", () => {
  it("uses the RLS-aware latest-per-item view without a global row cap", () => {
    const page = readFileSync(resolve(process.cwd(), "src/app/dashboard/menu/page.tsx"), "utf8");
    const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260717021158_latest_menu_item_media_view.sql"), "utf8");

    expect(page).toContain('.from("latest_menu_item_media_assets")');
    expect(page).not.toContain(".limit(100)");
    expect(migration).toContain("with (security_invoker = true)");
    expect(migration).toContain("distinct on (asset.organization_id, asset.menu_item_id)");
    expect(migration).toContain("revoke all on public.latest_menu_item_media_assets from public, anon");
  });
});
