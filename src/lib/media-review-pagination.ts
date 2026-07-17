export const MEDIA_REVIEW_PAGE_SIZE = 24;

export function parseMediaReviewPage(value?: string) {
  if (!value || !/^\d+$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function mediaReviewHref(
  page: number,
  result?: { reviewed?: "approved" | "rejected"; error?: string; context?: string },
) {
  const query = new URLSearchParams();
  if (page > 1) query.set("page", String(page));
  if (result?.reviewed) query.set("reviewed", result.reviewed);
  if (result?.error) query.set("error", result.error);
  if (result?.context) query.set("context", result.context);
  const suffix = query.toString();
  return suffix ? `/ops/media?${suffix}` : "/ops/media";
}

export function parseMediaReviewContext(value?: string) {
  const match = value?.match(/^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}):([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i);
  return match ? { organizationId: match[1], menuId: match[2], value } : null;
}
