import { redirect } from "next/navigation";
import { accessDestination } from "@/lib/access-destination";
import { requireUserContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AccessPage() {
  const context = await requireUserContext();
  redirect(accessDestination(context));
}
