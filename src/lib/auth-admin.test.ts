import type { SupabaseClient, User } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { findAuthUserByEmail, resolveOwnerAuthUser } from "@/lib/auth-admin";

function user(id: string, email: string) {
  return { id, email } as User;
}

function adminClient(input: {
  pages: User[][];
  invitation?: { data: { user: User | null }; error: { message: string } | null };
}) {
  const listUsers = vi.fn(async ({ page }: { page: number; perPage: number }) => ({
    data: { users: input.pages[page - 1] ?? [] },
    error: null,
  }));
  const inviteUserByEmail = vi.fn(async () => input.invitation ?? ({
    data: { user: user("invited", "owner@example.com") },
    error: null,
  }));
  return {
    client: { auth: { admin: { listUsers, inviteUserByEmail } } } as unknown as SupabaseClient,
    listUsers,
    inviteUserByEmail,
  };
}

describe("Auth owner resolution", () => {
  it("finds a confirmed existing user on a later paginated page", async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) =>
      user(`other-${index}`, `other-${index}@example.com`));
    const admin = adminClient({ pages: [firstPage, [user("owner", "Owner@Example.com")]] });

    await expect(findAuthUserByEmail(admin.client, " owner@example.com "))
      .resolves.toMatchObject({ id: "owner" });
    expect(admin.listUsers).toHaveBeenCalledTimes(2);
  });

  it("invites only when no matching Auth user exists", async () => {
    const admin = adminClient({ pages: [[]] });

    await expect(resolveOwnerAuthUser({
      admin: admin.client,
      email: " Owner@Example.com ",
      fullName: "Owner Name",
      redirectTo: "https://example.com/auth/callback",
    })).resolves.toMatchObject({ invitation: "sent", user: { id: "invited" } });
    expect(admin.inviteUserByEmail).toHaveBeenCalledWith("owner@example.com", {
      data: { full_name: "Owner Name" },
      redirectTo: "https://example.com/auth/callback",
    });
  });

  it("recovers when the user is created between lookup and invite", async () => {
    const owner = user("raced", "owner@example.com");
    const listUsers = vi
      .fn()
      .mockResolvedValueOnce({ data: { users: [] }, error: null })
      .mockResolvedValueOnce({ data: { users: [owner] }, error: null });
    const inviteUserByEmail = vi.fn(async () => ({
      data: { user: null },
      error: { message: "already registered" },
    }));
    const client = {
      auth: { admin: { listUsers, inviteUserByEmail } },
    } as unknown as SupabaseClient;

    await expect(resolveOwnerAuthUser({
      admin: client,
      email: "owner@example.com",
      fullName: "Owner",
      redirectTo: "https://example.com/auth/callback",
    })).resolves.toEqual({ user: owner, invitation: "existing" });
  });
});
