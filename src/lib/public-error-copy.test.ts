import { describe, expect, it } from "vitest";
import { PUBLIC_ERROR_COPY, publicErrorLocale } from "@/lib/public-error-copy";

describe("public menu error recovery", () => {
  it("keeps recovery copy in the requested supported language", () => {
    expect(publicErrorLocale("/r/osteria/fr")).toBe("fr");
    expect(PUBLIC_ERROR_COPY.fr.retry).toBe("Réessayer");
    expect(publicErrorLocale("/r/osteria")).toBe("it");
    expect(publicErrorLocale("/r/osteria/unsupported")).toBe("it");
  });
});
