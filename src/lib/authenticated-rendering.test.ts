import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("authenticated route rendering", () => {
  it.each(["dashboard", "ops"])("keeps the %s layout request-bound", (area) => {
    const source = readFileSync(resolve(process.cwd(), `src/app/${area}/layout.tsx`), "utf8");

    expect(source).toContain('export const dynamic = "force-dynamic"');
  });
});
