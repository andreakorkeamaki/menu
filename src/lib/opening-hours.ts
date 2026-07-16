import { z } from "zod";

export const openingHoursSchema = z.array(
  z.object({
    days: z.string().trim().min(1).max(80),
    hours: z.string().trim().min(1).max(120),
  }),
).max(14);

function isBlank(value: unknown) {
  return typeof value === "string" && value.trim() === "";
}

export function parseOpeningHoursInput(dayValues: unknown[], hourValues: unknown[]) {
  const rowCount = Math.max(dayValues.length, hourValues.length);
  const rows = Array.from({ length: rowCount }, (_, index) => ({
    days: dayValues[index] ?? "",
    hours: hourValues[index] ?? "",
  })).filter((row) => !(isBlank(row.days) && isBlank(row.hours)));

  return openingHoursSchema.safeParse(rows);
}
