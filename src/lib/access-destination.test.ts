import { describe, expect, it } from "vitest";
import { accessDestination } from "@/lib/access-destination";

describe("authenticated area selection", () => {
  it("always keeps platform staff in the operator area", () => {
    expect(accessDestination({
      isOperator: true,
      memberships: [{ organization_id: "legacy-restaurant" }],
    })).toBe("/ops");
  });

  it("sends restaurant members only to their dashboard", () => {
    expect(accessDestination({
      isOperator: false,
      memberships: [{ organization_id: "restaurant-1" }],
    })).toBe("/dashboard");
  });

  it("rejects authenticated accounts without an application role", () => {
    expect(accessDestination({ isOperator: false, memberships: [] }))
      .toBe("/login?error=no-membership");
  });
});
