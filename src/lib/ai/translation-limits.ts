export const TRANSLATION_BATCH_LIMIT = 200;

export function maximumTranslationRequests(total: number, singleRow = false) {
  if (singleRow) return 1;
  return Math.max(1, Math.ceil(Math.max(0, total) / TRANSLATION_BATCH_LIMIT));
}
