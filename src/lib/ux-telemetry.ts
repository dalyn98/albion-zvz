export const UX_TELEMETRY_EVENT_TYPES = [
  'surface_view',
  'approval_filter_change',
  'approval_action',
  'detail_toggle',
  'navigation_action',
  'task_started',
  'validation_failed',
  'previewed',
  'submitted',
  'partial_failed',
  'completed',
  'undone',
  'abandoned',
] as const

export type UxTelemetryEventType = (typeof UX_TELEMETRY_EVENT_TYPES)[number]

export const UX_TELEMETRY_SURFACES = [
  'admin_approvals',
  'admin_shop',
  'member_home',
  'home_events',
  'event_login',
  'app_navigation',
  'admin_events',
  'admin_tactics',
  'admin_regear',
  'admin_finance',
  'admin_inventory',
  'admin_settings',
  'admin_permissions',
  'admin_operations',
  'member_events',
  'member_regear',
  'shop',
  'craft',
  'battles',
  'stats',
  'members',
  'market',
  'onboarding',
] as const

export type UxTelemetrySurface = (typeof UX_TELEMETRY_SURFACES)[number]

function pathIsWithin(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`)
}

export function uxTelemetrySurfaceForPath(pathname: string): UxTelemetrySurface | null {
  if (pathIsWithin(pathname, '/admin/dashboard/approvals')) return 'admin_approvals'
  if (pathIsWithin(pathname, '/admin/dashboard/shop')) return 'admin_shop'
  if (pathIsWithin(pathname, '/admin/dashboard/events')) return 'admin_events'
  if (pathIsWithin(pathname, '/admin/dashboard/tactics')) return 'admin_tactics'
  if (
    pathIsWithin(pathname, '/admin/dashboard/regear') ||
    pathIsWithin(pathname, '/admin/dashboard/role-rewards')
  ) return 'admin_regear'
  if (
    pathIsWithin(pathname, '/admin/dashboard/exchanges') ||
    pathIsWithin(pathname, '/admin/dashboard/donations') ||
    pathIsWithin(pathname, '/admin/dashboard/settlements') ||
    pathIsWithin(pathname, '/admin/dashboard/siphon')
  ) return 'admin_finance'
  if (
    pathIsWithin(pathname, '/admin/dashboard/inventory') ||
    pathIsWithin(pathname, '/admin/dashboard/craft')
  ) return 'admin_inventory'
  if (pathIsWithin(pathname, '/admin/dashboard/permissions')) return 'admin_permissions'
  if (
    pathIsWithin(pathname, '/admin/dashboard/settings') ||
    pathIsWithin(pathname, '/admin/dashboard/guild-profile')
  ) return 'admin_settings'
  if (
    pathIsWithin(pathname, '/admin/dashboard/backup') ||
    pathIsWithin(pathname, '/admin/dashboard/audit') ||
    pathIsWithin(pathname, '/admin/dashboard/killbot') ||
    pathIsWithin(pathname, '/admin/dashboard/content-compliance') ||
    pathIsWithin(pathname, '/admin/dashboard/loot-audit')
  ) return 'admin_operations'
  if (pathIsWithin(pathname, '/craft')) return 'craft'
  if (pathIsWithin(pathname, '/battles')) return 'battles'
  if (
    pathIsWithin(pathname, '/leaderboard') ||
    pathIsWithin(pathname, '/admin/dashboard/stats')
  ) return 'stats'
  if (pathIsWithin(pathname, '/members')) return 'members'
  if (pathIsWithin(pathname, '/market')) return 'market'
  if (pathIsWithin(pathname, '/shop')) return 'shop'
  if (pathIsWithin(pathname, '/regear')) return 'member_regear'
  if (pathIsWithin(pathname, '/onboard') || pathIsWithin(pathname, '/onboarding')) {
    return 'onboarding'
  }
  if (pathIsWithin(pathname, '/me')) return 'member_home'
  if (pathIsWithin(pathname, '/events')) return 'event_login'
  if (pathname === '/') return 'home_events'
  return null
}

export interface UxTelemetryPayload {
  eventType: UxTelemetryEventType
  surface: UxTelemetrySurface
  flowId: string
  elapsedMs?: number
  metadata: Record<string, string>
}

export interface UxWorkflowEventDetail {
  eventType: UxTelemetryEventType
  metadata?: Record<string, string>
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
  'workflow',
  'stage',
  'risk',
  'countBucket',
  'source',
  'reason',
  'mode',
  'scope',
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

export function emitUxWorkflowEvent(detail: UxWorkflowEventDetail): void {
  if (typeof document === 'undefined') return
  document.dispatchEvent(new CustomEvent<UxWorkflowEventDetail>('ux-workflow-event', { detail }))
}
