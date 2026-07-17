export const PUBLICATION_HISTORY_PAGE_SIZE = 10;

export function parsePublicationHistoryPage(value?: string) {
  if (!value || !/^\d+$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function publicationHistoryHref(page: number) {
  return page > 1 ? `/dashboard/menu/review?history_page=${page}` : "/dashboard/menu/review";
}
