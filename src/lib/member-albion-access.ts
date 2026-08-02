export interface AlbionMemberVerificationSession {
  isMember?: boolean
  isLocalGuildAccount?: boolean
}

// Discord members complete the ordinary Albion onboarding/verification flow.
// Local guild accounts already select and resolve their Albion character while
// registering, and are constrained separately to event/regear routes.
export function isAlbionMemberVerificationSubject(
  session: AlbionMemberVerificationSession | null | undefined,
): boolean {
  return session?.isMember === true && session.isLocalGuildAccount !== true
}
