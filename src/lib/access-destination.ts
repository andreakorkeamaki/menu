export interface AccessDestinationContext {
  isOperator: boolean;
  memberships: Array<{ organization_id: string }>;
}

/**
 * Platform staff and restaurant accounts have distinct entry points. Operator
 * access deliberately wins over legacy memberships so one session can never
 * be used to move between the two application areas.
 */
export function accessDestination(context: AccessDestinationContext) {
  if (context.isOperator) return "/ops";
  if (context.memberships.length > 0) return "/dashboard";
  return "/login?error=no-membership";
}
