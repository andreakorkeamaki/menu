export const RESTAURANT_LIST_PAGE_SIZE = 25;

export function parseRestaurantListPage(value: string | undefined) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function restaurantListHref(page: number) {
  return page > 1 ? `/ops/restaurants?page=${page}` : "/ops/restaurants";
}
