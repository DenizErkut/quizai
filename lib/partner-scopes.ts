// Partner API scope catalogue (pure, unit-testable).
export const BASE_SCOPES = ['institution:read', 'students:read:pseudonymous']
export const IDENTIFIED_SCOPES = [
  'institution:read:identity', 'students:read:identified', 'classrooms:read', 'results:read',
  'mastery:read', 'grades:read', 'grades:write', 'students:link',
]
export const ALL_PARTNER_SCOPES = [...BASE_SCOPES, ...IDENTIFIED_SCOPES]

export function needsDataProcessingAck(scopes: string[]) {
  return scopes.some(scope => !BASE_SCOPES.includes(scope))
}

