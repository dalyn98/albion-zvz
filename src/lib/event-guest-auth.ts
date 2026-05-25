import { classifyHost, resolveTenantBySlug } from '@/lib/tenant-resolver'

export interface EventGuestAuthScope {
  eventId: string
  guildId: string
  source: 'invite' | 'public-event'
}

interface SelectQueryBuilder {
  select: (columns: string) => FilterQueryBuilder
}

interface FilterQueryBuilder {
  eq: (column: string, value: unknown) => FilterQueryBuilder
  maybeSingle: () => Promise<{
    data: Record<string, unknown> | null
    error: { message: string } | null
  }>
}

interface EventGuestAuthDb {
  from: (table: string) => unknown
}

interface TokenRow {
  event_id: string
  revoked_at: string | null
  expires_at: string | null
}

interface EventRow {
  guild_id: string
  status: string | null
}

export function extractEventIdFromReturnTo(returnTo: string): string | null {
  if (!returnTo.startsWith('/') || returnTo.startsWith('//')) return null
  try {
    const pathname = new URL(returnTo, 'https://albion-guildmanager.local').pathname
    const segments = pathname.split('/').filter(Boolean)
    if (segments[0] !== 'events' || !segments[1]) return null
    return decodeURIComponent(segments[1])
  } catch {
    return null
  }
}

function isLiveEvent(row: EventRow | null | undefined): row is EventRow {
  return !!row?.guild_id && row.status !== 'draft'
}

async function resolveEventRow(
  db: EventGuestAuthDb,
  eventId: string,
): Promise<EventRow | null> {
  const { data, error } = await (db.from('events') as SelectQueryBuilder)
    .select('guild_id, status')
    .eq('id', eventId)
    .maybeSingle()
  const row = data as EventRow | null
  if (error || !isLiveEvent(row)) return null
  return row
}

export async function resolveEventGuestAuthScope(
  db: EventGuestAuthDb,
  input: {
    inviteToken: string | null | undefined
    returnTo: string
    nowIso?: string
  },
): Promise<EventGuestAuthScope | null> {
  const inviteToken = input.inviteToken?.trim() || null
  const nowIso = input.nowIso ?? new Date().toISOString()

  if (inviteToken) {
    const { data: tokenRow, error: tokenError } = await (db.from('event_guest_tokens') as SelectQueryBuilder)
      .select('event_id, revoked_at, expires_at')
      .eq('token', inviteToken)
      .maybeSingle()
    const token = tokenRow as TokenRow | null
    if (
      tokenError ||
      !token ||
      token.revoked_at ||
      (token.expires_at && token.expires_at <= nowIso)
    ) {
      return null
    }

    const eventRow = await resolveEventRow(db, token.event_id)
    if (!eventRow) return null
    return {
      eventId: token.event_id,
      guildId: eventRow.guild_id,
      source: 'invite',
    }
  }

  const eventId = extractEventIdFromReturnTo(input.returnTo)
  if (!eventId) return null

  const eventRow = await resolveEventRow(db, eventId)
  if (!eventRow) return null
  return {
    eventId,
    guildId: eventRow.guild_id,
    source: 'public-event',
  }
}

export async function resolvePublicEventPageGuildId(
  db: EventGuestAuthDb,
  input: {
    eventId: string
    inviteToken: string | null | undefined
    hostHeader: string | null | undefined
    nowIso?: string
  },
): Promise<string | null> {
  const inviteToken = input.inviteToken?.trim() || null
  const nowIso = input.nowIso ?? new Date().toISOString()

  if (inviteToken) {
    const { data: tokenRow, error: tokenError } = await (db.from('event_guest_tokens') as SelectQueryBuilder)
      .select('event_id, revoked_at, expires_at')
      .eq('token', inviteToken)
      .eq('event_id', input.eventId)
      .maybeSingle()
    const token = tokenRow as TokenRow | null
    if (
      !tokenError &&
      token &&
      !token.revoked_at &&
      (!token.expires_at || token.expires_at > nowIso)
    ) {
      const eventRow = await resolveEventRow(db, token.event_id)
      if (eventRow) return eventRow.guild_id
    }
  }

  const classification = classifyHost(input.hostHeader)
  if (classification.kind === 'tenant') {
    const tenant = await resolveTenantBySlug(classification.slug)
    return tenant?.tenantId ?? null
  }

  if (classification.kind !== 'root' && classification.kind !== 'localhost' && classification.kind !== 'preview') {
    return null
  }

  const eventRow = await resolveEventRow(db, input.eventId)
  return eventRow?.guild_id ?? null
}
