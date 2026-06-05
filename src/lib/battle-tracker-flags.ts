const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on'])
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off'])

function truthyFlag(value: string | null | undefined): boolean | null {
  if (value === null || value === undefined) return null
  const normalized = value.trim().toLowerCase()
  if (TRUE_VALUES.has(normalized)) return true
  if (FALSE_VALUES.has(normalized)) return false
  return null
}

export function resolveBattleTrackerShadowSyncEnabled(
  queryValue: string | null | undefined,
  envValue: string | null | undefined,
): boolean {
  const queryOverride = truthyFlag(queryValue)
  if (queryOverride !== null) return queryOverride
  const envOverride = truthyFlag(envValue)
  if (envOverride !== null) return envOverride
  return true
}

export function resolveBattleTrackerProjectionDiffSyncEnabled(
  queryValue: string | null | undefined,
  envValue: string | null | undefined,
  shadowSyncEnabled: boolean,
): boolean {
  if (!shadowSyncEnabled) return false
  const queryOverride = truthyFlag(queryValue)
  if (queryOverride !== null) return queryOverride
  return truthyFlag(envValue) === true
}
