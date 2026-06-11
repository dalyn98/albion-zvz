import { CAP, hasAnyCapability, parseCapabilities } from '@/lib/permissions'
import type { SessionPayload } from '@/lib/session'

export const TACTIC_VIEW_CAPS = [
  CAP.TACTICS_VIEW,
  CAP.TACTICS_MANAGE,
  CAP.TACTICS_PUBLISH,
] as const

export const TACTIC_MANAGE_CAPS = [CAP.TACTICS_MANAGE] as const
export const TACTIC_PUBLISH_CAPS = [CAP.TACTICS_MANAGE, CAP.TACTICS_PUBLISH] as const

export function sessionCanViewTactics(session: SessionPayload | null): boolean {
  if (!session) return false
  if (session.isAdmin || session.isMember) return true
  return hasAnyCapability(parseCapabilities(session.capabilities), TACTIC_VIEW_CAPS)
}

export function sessionCanManageTactics(session: SessionPayload | null): boolean {
  if (!session) return false
  if (session.isAdmin) return true
  return hasAnyCapability(parseCapabilities(session.capabilities), TACTIC_MANAGE_CAPS)
}

export function sessionCanPublishTactics(session: SessionPayload | null): boolean {
  if (!session) return false
  if (session.isAdmin) return true
  return hasAnyCapability(parseCapabilities(session.capabilities), TACTIC_PUBLISH_CAPS)
}
