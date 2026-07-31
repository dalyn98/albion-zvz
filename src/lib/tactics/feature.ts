export const TACTICS_EXPERIMENTAL_SETTING_KEY =
  'tactics_experimental_enabled' as const

export function isTacticsExperimentalSettingEnabled(
  value: string | null | undefined,
): boolean {
  return value === 'true'
}
