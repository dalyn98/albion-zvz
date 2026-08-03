import type { SessionPayload } from '@/lib/session-verify'

interface SessionRecoveryInput {
  currentSession: SessionPayload | null
  signedSession: SessionPayload | null
  hostTenantId: string | null
}

/**
 * A revoked Discord snapshot can be recovered without another OAuth round-trip.
 * The refresh route still verifies the signature, tenant host, current Discord
 * membership, and live capabilities before it writes a replacement cookie.
 */
export function canRecoverDiscordSession({
  currentSession,
  signedSession,
  hostTenantId,
}: SessionRecoveryInput): boolean {
  if (currentSession || !signedSession || !hostTenantId) return false
  if (!signedSession.guildId || signedSession.guildId !== hostTenantId) return false
  if (!signedSession.discordId || signedSession.isGuest || signedSession.isLocalGuildAccount) {
    return false
  }
  return true
}
