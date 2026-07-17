export type RestaurantPhotoStatus = "approved" | "review" | "missing" | "rejected";

export function restaurantPhotoStatus(input: {
  imageUrl: string | null;
  approvalStatus?: "draft" | "approved" | "rejected";
}): RestaurantPhotoStatus {
  if (input.approvalStatus === "draft") return "review";
  if (input.imageUrl) return "approved";
  if (input.approvalStatus === "rejected") return "rejected";
  return "missing";
}

export function restaurantPhotoGenerationMode(input: {
  imageUrl: string | null;
  hasMediaAsset: boolean;
}) {
  return input.imageUrl || input.hasMediaAsset ? "regenerate" as const : "generate" as const;
}
