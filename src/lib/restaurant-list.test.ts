import { describe, expect, it } from "vitest";
import {
  parseRestaurantListPage,
  RESTAURANT_LIST_PAGE_SIZE,
  restaurantListHref,
} from "@/lib/restaurant-list";

describe("operator restaurant list pagination", () => {
  it("accepts only positive integer pages", () => {
    expect(parseRestaurantListPage("3")).toBe(3);
    expect(parseRestaurantListPage("0")).toBe(1);
    expect(parseRestaurantListPage("1.5")).toBe(1);
    expect(parseRestaurantListPage("invalid")).toBe(1);
    expect(RESTAURANT_LIST_PAGE_SIZE).toBe(25);
  });

  it("keeps the first page URL canonical", () => {
    expect(restaurantListHref(1)).toBe("/ops/restaurants");
    expect(restaurantListHref(2)).toBe("/ops/restaurants?page=2");
  });
});
