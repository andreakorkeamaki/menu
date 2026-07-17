export const ACTIVE_ORGANIZATION_COOKIE = "menuinterattivo_active_organization";

export function selectMembership<T extends { organization_id: string }>(
  memberships: T[],
  selectedOrganizationId: string | null | undefined,
) {
  return memberships.find((membership) => membership.organization_id === selectedOrganizationId)
    ?? memberships[0];
}
