import type { AlbionServer } from '@/lib/albion-gameinfo'

function normalizedBasePath(basePath: string): string {
  return basePath.length > 1 ? basePath.replace(/\/+$/, '') : basePath
}

export function normalizePublicZvzAlbionId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (
    normalized.length === 0 ||
    normalized.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(normalized)
  ) {
    return null
  }
  return normalized
}

export function normalizePublicZvzDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null
  }
  const date = new Date(`${value}T00:00:00.000Z`)
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    return null
  }
  return value
}

export function normalizePublicZvzUtcDateTimeLocal(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
  ) {
    return null
  }
  const date = new Date(`${value}:00.000Z`)
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 16) !== value
  ) {
    return null
  }
  return date.toISOString()
}

export function normalizePublicZvzWeekStart(value: unknown): string | null {
  const normalized = normalizePublicZvzDate(value)
  if (!normalized) return null
  return new Date(`${normalized}T00:00:00.000Z`).getUTCDay() === 1
    ? normalized
    : null
}

export function normalizePublicZvzSeasonId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    normalized,
  )
    ? normalized
    : null
}

function buildRecordHref(input: {
  basePath: string
  kind: 'guild' | 'alliance'
  server: AlbionServer
  albionId: string
  weekStart?: string | null
  seasonId?: string | null
  asOfDate?: string | null
}): string {
  const pathname = [
    normalizedBasePath(input.basePath),
    input.kind,
    input.server,
    encodeURIComponent(input.albionId),
  ].join('/')
  const seasonId = normalizePublicZvzSeasonId(input.seasonId)
  const asOfDate = normalizePublicZvzDate(input.asOfDate)
  if (seasonId) {
    const query = new URLSearchParams({ season: seasonId })
    if (asOfDate) query.set('asOf', asOfDate)
    return `${pathname}?${query.toString()}`
  }

  const weekStart = normalizePublicZvzWeekStart(input.weekStart)
  return weekStart
    ? `${pathname}?week=${encodeURIComponent(weekStart)}`
    : pathname
}

export function buildPublicZvzGuildRecordHref(input: {
  basePath: string
  server: AlbionServer
  guildAlbionId: string
  weekStart?: string | null
  seasonId?: string | null
  asOfDate?: string | null
}): string {
  return buildRecordHref({
    basePath: input.basePath,
    kind: 'guild',
    server: input.server,
    albionId: input.guildAlbionId,
    weekStart: input.weekStart,
    seasonId: input.seasonId,
    asOfDate: input.asOfDate,
  })
}

export function buildPublicZvzAllianceRecordHref(input: {
  basePath: string
  server: AlbionServer
  allianceAlbionId: string
  weekStart?: string | null
  seasonId?: string | null
  asOfDate?: string | null
}): string {
  return buildRecordHref({
    basePath: input.basePath,
    kind: 'alliance',
    server: input.server,
    albionId: input.allianceAlbionId,
    weekStart: input.weekStart,
    seasonId: input.seasonId,
    asOfDate: input.asOfDate,
  })
}

export function normalizePublicZvzBattleId(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const normalized = String(value).trim()
  if (!/^\d{1,12}$/.test(normalized)) return null
  const parsed = Number(normalized)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

export function buildPublicZvzBattleReportHref(input: {
  basePath: string
  server: AlbionServer
  battleId: number
}): string {
  return `${normalizedBasePath(input.basePath)}/battle/${input.server}/${input.battleId}`
}

export function buildPublicZvzWeeklyHref(input: {
  basePath: string
  server: AlbionServer
  weekStart: string
}): string {
  return `${normalizedBasePath(input.basePath)}/weekly/${input.server}/${encodeURIComponent(input.weekStart)}`
}
