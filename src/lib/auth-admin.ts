import type { SupabaseClient, User } from "@supabase/supabase-js";

const USERS_PER_PAGE = 1000;
const MAX_USER_PAGES = 100;

function canonicalEmail(value: string) {
  return value.trim().toLocaleLowerCase("en-US");
}

export async function findAuthUserByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<User | null> {
  const expected = canonicalEmail(email);
  for (let page = 1; page <= MAX_USER_PAGES; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: USERS_PER_PAGE,
    });
    if (error) throw new Error(`Ricerca utente proprietario non riuscita: ${error.message}`);
    const users = data.users ?? [];
    const found = users.find(
      (user) => user.email && canonicalEmail(user.email) === expected,
    );
    if (found) return found;
    if (users.length < USERS_PER_PAGE) return null;
  }
  throw new Error("Ricerca utente proprietario interrotta: archivio Auth troppo esteso.");
}

export async function resolveOwnerAuthUser(input: {
  admin: SupabaseClient;
  email: string;
  fullName: string;
  redirectTo: string;
}) {
  const email = canonicalEmail(input.email);
  const existing = await findAuthUserByEmail(input.admin, email);
  if (existing) return { user: existing, invitation: "existing" as const };

  const { data, error } = await input.admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: input.fullName },
    redirectTo: input.redirectTo,
  });
  if (!error && data.user) {
    return { user: data.user, invitation: "sent" as const };
  }

  // Resolve the create-between-list-and-invite race without creating a duplicate account.
  const racedUser = await findAuthUserByEmail(input.admin, email);
  if (racedUser) return { user: racedUser, invitation: "existing" as const };
  throw new Error(`Invito proprietario non riuscito: ${error?.message ?? "utente assente"}`);
}
