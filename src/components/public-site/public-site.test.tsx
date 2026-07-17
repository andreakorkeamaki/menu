import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PublicSite } from "@/components/public-site/public-site";
import { DEMO_SNAPSHOT } from "@/lib/demo-data";

describe("PublicSite draft preview", () => {
  it("stays private, labels fallback content and keeps language links in preview", () => {
    const html = renderToStaticMarkup(
      <PublicSite
        snapshot={DEMO_SNAPSHOT}
        locale="en"
        preview={{ basePath: "/dashboard/menu/preview", pendingTranslations: 3 }}
      />,
    );

    expect(html).toContain("Bozza privata");
    expect(html).toContain("3 testi in EN non sono approvati");
    expect(html).toContain("Anteprima bozza · non pubblicata");
    expect(html).toContain("/dashboard/menu/preview?locale=fr");
    expect(html).not.toContain("application/ld+json");
    expect(html).not.toContain('href="/r/demo/fr"');
  });

  it("renders a safe fallback when a legacy snapshot contains an unreadable accent", () => {
    const html = renderToStaticMarkup(
      <PublicSite
        snapshot={{
          ...DEMO_SNAPSHOT,
          theme: { ...DEMO_SNAPSHOT.theme, accent: "#f2c94c", accentText: "#ffffff" },
        }}
        locale="it"
      />,
    );

    expect(html).toContain("--public-accent:#7f3127");
    expect(html).toContain("--public-accent-text:#ffffff");
    expect(html).not.toContain("--public-accent:#f2c94c");
  });
});
