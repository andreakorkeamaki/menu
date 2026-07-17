import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

describe("dashboard visual state regressions", () => {
  it("animates running and queued image placeholders with the shared spinner keyframe", () => {
    expect(css).toContain(".style-studio-results li.is-running .menu-image-activity-icon::after");
    expect(css).toContain(".style-studio-results li.is-queued .menu-image-activity-icon::after");
    expect(css).toContain("animation: loading-spin 720ms linear infinite");
    expect(css).not.toContain("animation: spin 700ms linear infinite");
  });

  it("keeps the light QR action text dark on its white background", () => {
    const selector = ".qr-card .qr-actions .button-light";
    const rule = css.slice(css.indexOf(selector), css.indexOf("}", css.indexOf(selector)) + 1);

    expect(rule).toContain("color: var(--dark)");
    expect(rule).toContain("background: #fff");
  });
});
