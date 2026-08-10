import 'server-only'

import { log } from '@/lib/log'
import { getAdminClient } from '@/lib/supabase-admin'
import { getSupabaseErrorCode } from '@/lib/supabase-query-error'
import {
  retrySupabaseRead,
  type SupabaseReadResult,
} from '@/lib/supabase-read-retry'
import type { SessionPayload } from '@/lib/session-verify'

interface SessionRevocationRow {
  invalid_before: string
}

export type TenantSessionStatus = 'current' | 'revoked' | 'unavailable'

export function isSessionIssuedAfterRevocation(
  issuedAt: number,
  revocations: readonly SessionRevocationRow[],
): boolean {
  return revocations.every((row) => {
    const cutoff = Date.parse(row.invalid_before)
    return !Number.isFinite(cutoff) || issuedAt > cutoff
  })
}

async function retrySessionRevocationRead<T>(
  session: SessionPayload,
  read: () => PromiseLike<SupabaseReadResult<T>>,
): Promise<SupabaseReadResult<T>> {
  return retrySupabaseRead(read, {
    label: 'session_revocation.lookup',
    onRetry: ({ attempt, maxAttempts, delayMs, error }) => {
      log.warn('[session-revocation] transient lookup retry', {
        tenant_id: session.guildId,
        discord_id: session.discordId,
        reason: 'lookup_retry',
        attempt,
        max_attempts: maxAttempts,
        delay_ms: delayMs,
        error_code: getSupabaseErrorCode(error),
      })
    },
  })
}

export async function getTenantSessionStatus(
  session: SessionPayload,
): Promise<TenantSessionStatus> {
  if (!session.guildId) return 'current'
  let result: SupabaseReadResult<SessionRevocationRow[] | null>
  try {
    result = await retrySessionRevocationRead(session, () =>
      getAdminClient()
        .from('tenant_session_revocations')
        .select('invalid_before')
        .eq('guild_id', session.guildId)
        .in('subject', ['*', session.discordId]),
    )
  } catch (error) {
    log.error('[session-revocation] lookup threw', error, {
      tenant_id: session.guildId,
      discord_id: session.discordId,
      reason: 'lookup_error',
    })
    return 'unavailable'
  }

  // The table is the revocation authority. A database failure must not leave a
  // stale privileged cookie usable for up to its seven-day expiry.
  if (result.error) {
    log.error('[session-revocation] lookup failed', result.error, {
      tenant_id: session.guildId,
      discord_id: session.discordId,
      reason: 'lookup_error',
      error_code: getSupabaseErrorCode(result.error),
    })
    return 'unavailable'
  }

  const revocations = (result.data ?? []) as SessionRevocationRow[]
  const isCurrent = isSessionIssuedAfterRevocation(
    session.issuedAt,
    revocations,
  )
  if (!isCurrent) {
    log.warn('[session-revocation] session rejected', {
      tenant_id: session.guildId,
      discord_id: session.discordId,
      reason: 'revoked',
      issued_at: Number.isFinite(session.issuedAt)
        ? new Date(session.issuedAt).toISOString()
        : null,
      revocation_count: revocations.length,
    })
  }
  return isCurrent ? 'current' : 'revoked'
}

export async function isTenantSessionCurrent(
  session: SessionPayload,
): Promise<boolean> {
  return (await getTenantSessionStatus(session)) === 'current'
}
