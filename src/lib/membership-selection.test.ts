import { describe, expect, it } from "vitest";
import { selectMembership } from "@/lib/membership-selection";

const memberships = [
  { organization_id: "org-1", role: "owner" },
  { organization_id: "org-2", role: "editor" },
];

describe("membership selection", () => {
  it("uses the explicitly selected organization when it belongs to the user", () => {
    expect(selectMembership(memberships, "org-2")?.organization_id).toBe("org-2");
  });

  it("falls back safely when a cookie names an unrelated organization", () => {
    expect(selectMembership(memberships, "other-tenant")?.organization_id).toBe("org-1");
    expect(selectMembership([], "org-1")).toBeUndefined();
  });
});
