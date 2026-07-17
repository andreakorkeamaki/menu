import type { DemoRequestStatus } from "@/lib/demo-request";

export const LEAD_PAGE_SIZE = 20;

export function parseLeadPage(value?: string) {
  if (!value || !/^\d+$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function leadListHref({
  status,
  page = 1,
  updated,
  error,
}: {
  status?: DemoRequestStatus | null;
  page?: number;
  updated?: boolean;
  error?: string;
}) {
  const query = new URLSearchParams();
  if (status) query.set("status", status);
  if (page > 1) query.set("page", String(page));
  if (updated) query.set("updated", "1");
  if (error) query.set("error", error);
  const suffix = query.toString();
  return suffix ? `/ops/leads?${suffix}` : "/ops/leads";
}
