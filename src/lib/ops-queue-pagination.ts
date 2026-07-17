export const OPS_QUEUE_PAGE_SIZE = 25;

export function parseOpsQueuePage(value?: string) {
  if (!value || !/^\d+$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function opsQueueHref(page: number) {
  return page > 1 ? `/ops?page=${page}` : "/ops";
}
