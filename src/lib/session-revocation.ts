import 'server-only'

import { getAdminClient } from '@/lib/supabase-admin'
import type { SessionPayload } from '@/lib/session-verify'

interface SessionRevocationRow {
  invalid_before: string
}

export function isSessionIssuedAfterRevocation(
  issuedAt: number,
  revocations: readonly SessionRevocationRow[],
): boolean {
  return revocations.every((row) => {
    const cutoff = Date.parse(row.invalid_before)
    return !Number.isFinite(cutoff) || issuedAt > cutoff
  })
}

export async function isTenantSessionCurrent(session: SessionPayload): Promise<boolean> {
  if (!session.guildId) return true
  const { data, error } = await getAdminClient()
    .from('tenant_session_revocations')
    .select('invalid_before')
    .eq('guild_id', session.guildId)
    .in('subject', ['*', session.discordId])

  // The table is the revocation authority. A database failure must not leave a
  // stale privileged cookie usable for up to its seven-day expiry.
  if (error) return false
  return isSessionIssuedAfterRevocation(
    session.issuedAt,
    (data ?? []) as SessionRevocationRow[],
  )
}
