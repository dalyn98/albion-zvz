export const REGEAR_SUPPORT_SETTING_KEY = 'regear_support_enabled' as const
export const REGEAR_SUPPORT_DISABLED_ERROR = 'REGEAR_SUPPORT_DISABLED' as const

export type RegearSupportState = 'unconfigured' | 'unsupported' | 'supported'
export type RegearFulfillmentMode = 'silver' | 'crafted'

export interface RegearSupportConfiguration {
  state: RegearSupportState
  supported: boolean
  fulfillmentMode: RegearFulfillmentMode | null
}

export function parseRegearSupportState(raw: string | null | undefined): RegearSupportState {
  if (raw === 'true') return 'supported'
  if (raw === 'false') return 'unsupported'
  return 'unconfigured'
}

export function parseRegearFulfillmentMode(
  craftRegearEnabledRaw: string | null | undefined,
): RegearFulfillmentMode {
  return craftRegearEnabledRaw === 'true' ? 'crafted' : 'silver'
}

export function resolveRegearSupportConfiguration(input: {
  supportRaw: string | null | undefined
  craftRegearEnabledRaw: string | null | undefined
}): RegearSupportConfiguration {
  const state = parseRegearSupportState(input.supportRaw)
  const supported = state === 'supported'
  return {
    state,
    supported,
    fulfillmentMode: supported
      ? parseRegearFulfillmentMode(input.craftRegearEnabledRaw)
      : null,
  }
}

export function isRegearFulfillmentMode(value: unknown): value is RegearFulfillmentMode {
  return value === 'silver' || value === 'crafted'
}
