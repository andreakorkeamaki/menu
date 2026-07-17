import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PublicationHistory } from "@/components/dashboard/publication-history";

vi.mock("@/app/dashboard/actions", () => ({
  restorePublishedVersion: "/publication/restore",
}));

describe("PublicationHistory", () => {
  it("separates the current immutable version from deliberate restore actions", () => {
    const html = renderToStaticMarkup(
      <PublicationHistory entries={[
        { id: "publication-3", version: 3, published_at: "2026-07-17T10:00:00.000Z", is_current: true, restored_from_id: "publication-1" },
        { id: "publication-2", version: 2, published_at: "2026-07-16T10:00:00.000Z", is_current: false },
      ]} total={22} page={1} totalPages={3} />,
    );

    expect(html).toContain("v3");
    expect(html).toContain("Versione attiva");
    expect(html).toContain("Ripristina questa versione");
    expect(html).toContain("Il contenuto attuale resterà nella cronologia");
    expect(html).toContain('name="publication_id" value="publication-2"');
    expect(html.match(/Conferma ripristino/g)).toHaveLength(1);
    expect(html).toContain("Versioni precedenti");
    expect(html).toContain("1–2 di 22");
  });
});
