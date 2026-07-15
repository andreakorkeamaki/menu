export type SortableMenuRow = { id: string; sort_order: number; category_id?: string };
export type DropPlacement = "before" | "after";

export function reorderRows<T extends SortableMenuRow>(
  rows: T[],
  movedId: string,
  targetId: string,
  placement: DropPlacement,
) {
  if (movedId === targetId) return rows;
  const moved = rows.find((row) => row.id === movedId);
  if (!moved) return rows;
  const reordered = rows.filter((row) => row.id !== movedId);
  const targetIndex = reordered.findIndex((row) => row.id === targetId);
  if (targetIndex < 0) return rows;
  reordered.splice(placement === "after" ? targetIndex + 1 : targetIndex, 0, moved);
  return reordered.map((row, sort_order) => ({ ...row, sort_order }));
}
