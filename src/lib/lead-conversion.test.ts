import { describe, expect, it } from "vitest";
import { leadProvisionDefaults } from "@/lib/lead-conversion";

describe("lead conversion defaults", () => {
  it("carries the qualified contact into provisioning without retyping", () => {
    expect(leadProvisionDefaults({
      restaurant_name: "L’Osteria dei Portici",
      city: "Bologna",
      contact_name: "Ada Rossi",
      email: "ada@example.com",
    })).toEqual({
      organizationName: "L’Osteria dei Portici",
      locationName: "L’Osteria dei Portici",
      city: "Bologna",
      slug: "l-osteria-dei-portici",
      contactName: "Ada Rossi",
      ownerEmail: "ada@example.com",
    });
  });
});
