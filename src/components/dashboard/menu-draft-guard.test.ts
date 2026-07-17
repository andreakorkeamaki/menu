import { describe, expect, it } from "vitest";
import { unsavedFormLabel } from "@/components/workspace-draft-guard";

describe("workspace draft guard", () => {
  it("describes unsaved scope without exposing implementation jargon", () => {
    expect(unsavedFormLabel(1)).toBe("1 riquadro da salvare");
    expect(unsavedFormLabel(3)).toBe("3 riquadri da salvare");
  });
});
