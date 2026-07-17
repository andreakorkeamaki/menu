"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getUserContext } from "@/lib/auth";
import { ACTIVE_ORGANIZATION_COOKIE } from "@/lib/membership-selection";

export async function switchOrganization(formData: FormData) {
  const organizationId = z.uuid().safeParse(formData.get("organization_id"));
  const context = await getUserContext();
  if (!context) redirect("/login");
  if (!organizationId.success || !context.memberships.some((membership) => membership.organization_id === organizationId.data)) {
    redirect("/dashboard?workspace_error=invalid");
  }
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORGANIZATION_COOKIE, organizationId.data, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
  redirect("/dashboard");
}
