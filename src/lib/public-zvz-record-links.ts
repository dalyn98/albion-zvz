import type { AlbionServer } from '@/lib/albion-gameinfo'

function normalizedBasePath(basePath: string): string {
  return basePath.length > 1 ? basePath.replace(/\/+$/, '') : basePath
}

export function normalizePublicZvzWeekStart(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null
  }
  const date = new Date(`${value}T00:00:00.000Z`)
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value ||
    date.getUTCDay() !== 1
  ) {
    return null
  }
  return value
}

function buildRecordHref(input: {
  basePath: string
  kind: 'guild' | 'alliance'
  server: AlbionServer
  albionId: string
  weekStart?: string | null
}): string {
  const pathname = [
    normalizedBasePath(input.basePath),
    input.kind,
    input.server,
    encodeURIComponent(input.albionId),
  ].join('/')
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
}): string {
  return buildRecordHref({
    basePath: input.basePath,
    kind: 'guild',
    server: input.server,
    albionId: input.guildAlbionId,
    weekStart: input.weekStart,
  })
}

export function buildPublicZvzAllianceRecordHref(input: {
  basePath: string
  server: AlbionServer
  allianceAlbionId: string
  weekStart?: string | null
}): string {
  return buildRecordHref({
    basePath: input.basePath,
    kind: 'alliance',
    server: input.server,
    albionId: input.allianceAlbionId,
    weekStart: input.weekStart,
  })
}
