export const UX_TELEMETRY_EVENT_TYPES = [
  'surface_view',
  'approval_filter_change',
  'approval_action',
  'detail_toggle',
  'navigation_action',
] as const

export type UxTelemetryEventType = (typeof UX_TELEMETRY_EVENT_TYPES)[number]

export const UX_TELEMETRY_SURFACES = [
  'admin_approvals',
  'admin_shop',
  'member_home',
  'home_events',
  'event_login',
  'app_navigation',
] as const

export type UxTelemetrySurface = (typeof UX_TELEMETRY_SURFACES)[number]

export interface UxTelemetryPayload {
  eventType: UxTelemetryEventType
  surface: UxTelemetrySurface
  flowId: string
  elapsedMs?: number
  metadata: Record<string, string>
}

const EVENT_TYPE_SET = new Set<string>(UX_TELEMETRY_EVENT_TYPES)
const SURFACE_SET = new Set<string>(UX_TELEMETRY_SURFACES)
const METADATA_KEYS = new Set([
  'tab',
  'filter',
  'action',
  'detail',
  'target',
  'layout',
  'viewport',
  'result',
])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SAFE_VALUE_PATTERN = /^[a-z0-9_:-]{1,48}$/i
const MAX_ELAPSED_MS = 30 * 60 * 1000

function parseMetadata(value: unknown): Record<string, string> | null {
  if (value === undefined) return {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const entries = Object.entries(value)
  if (entries.length > 8) return null
  const parsed: Array<[string, string]> = []
  for (const [key, item] of entries) {
    if (!METADATA_KEYS.has(key) || typeof item !== 'string' || !SAFE_VALUE_PATTERN.test(item)) {
      return null
    }
    parsed.push([key, item])
  }
  return Object.fromEntries(parsed)
}

export function parseUxTelemetryPayload(value: unknown): UxTelemetryPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  if (typeof input.eventType !== 'string' || !EVENT_TYPE_SET.has(input.eventType)) return null
  if (typeof input.surface !== 'string' || !SURFACE_SET.has(input.surface)) return null
  if (typeof input.flowId !== 'string' || !UUID_PATTERN.test(input.flowId)) return null
  const metadata = parseMetadata(input.metadata)
  if (!metadata) return null

  const elapsedMs = input.elapsedMs
  if (
    elapsedMs !== undefined &&
    (!Number.isInteger(elapsedMs) || Number(elapsedMs) < 0 || Number(elapsedMs) > MAX_ELAPSED_MS)
  ) {
    return null
  }

  return {
    eventType: input.eventType as UxTelemetryEventType,
    surface: input.surface as UxTelemetrySurface,
    flowId: input.flowId,
    ...(elapsedMs === undefined ? {} : { elapsedMs: Number(elapsedMs) }),
    metadata,
  }
}
