export const IMPORT_CASE_PAGE_SIZE = 25;

export function parseImportCasePage(value?: string) {
  if (!value || !/^\d+$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function importWorkspaceHref({
  page = 1,
  caseId,
  error,
}: {
  page?: number;
  caseId?: string;
  error?: string;
}) {
  const query = new URLSearchParams();
  if (caseId) query.set("case", caseId);
  if (page > 1) query.set("page", String(page));
  if (error) query.set("error", error);
  const suffix = query.toString();
  return suffix ? `/ops/import?${suffix}` : "/ops/import";
}
