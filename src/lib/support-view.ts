import 'server-only'

import type { SessionPayload } from '@/lib/session-verify'
import { isSuperAdmin } from '@/lib/super-admin-identity'
import { getImpersonationFromCookies } from '@/lib/super-admin-impersonation'

export const SUPPORT_VIEW_READ_ONLY_ERROR = 'SUPPORT_VIEW_READ_ONLY'

/**
 * Platform support impersonation is a diagnostic view, never tenant
 * authority. Shared mutation guards call this in addition to the request-level
 * Proxy boundary so stale Server Action references still fail closed.
 */
export async function assertSupportViewMutationAllowed(
  session: SessionPayload,
): Promise<void> {
  if (!isSuperAdmin(session.discordId)) return
  if (await getImpersonationFromCookies()) {
    throw new Error(SUPPORT_VIEW_READ_ONLY_ERROR)
  }
}
