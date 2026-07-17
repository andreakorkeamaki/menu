export const MEDIA_REVIEW_PAGE_SIZE = 24;

export function parseMediaReviewPage(value?: string) {
  if (!value || !/^\d+$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function mediaReviewHref(
  page: number,
  result?: { reviewed?: "approved" | "rejected"; error?: string },
) {
  const query = new URLSearchParams();
  if (page > 1) query.set("page", String(page));
  if (result?.reviewed) query.set("reviewed", result.reviewed);
  if (result?.error) query.set("error", result.error);
  const suffix = query.toString();
  return suffix ? `/ops/media?${suffix}` : "/ops/media";
}
