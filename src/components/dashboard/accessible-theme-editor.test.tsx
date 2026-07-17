import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AccessibleThemeEditor } from "@/components/dashboard/accessible-theme-editor";

vi.mock("@/app/dashboard/actions", () => ({ saveTheme: "/theme/save" }));

const baseTheme = {
  id: "theme-1",
  theme_key: "editorial",
  accent: "#9d3d2e",
  background: "#f4eee4",
  surface: "#fffaf1",
  text: "#24231f",
};

describe("AccessibleThemeEditor", () => {
  it("previews and permits an AA-safe palette", () => {
    const html = renderToStaticMarkup(<AccessibleThemeEditor theme={baseTheme} />);

    expect(html).toContain("AA leggibile");
    expect(html).toContain("Contrasto verificato");
    expect(html).toContain("Salva tema accessibile");
    expect(html).not.toContain('disabled=""');
  });

  it("blocks an unreadable accent before it reaches publication", () => {
    const html = renderToStaticMarkup(<AccessibleThemeEditor theme={{ ...baseTheme, accent: "#f2c94c" }} />);

    expect(html).toContain("Contrasto basso");
    expect(html).toContain("almeno un testo non raggiunge 4,5:1");
    expect(html).toContain('disabled=""');
  });
});
