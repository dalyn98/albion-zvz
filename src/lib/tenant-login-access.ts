import type { DiscordIdentity } from '@/lib/discord'

interface TenantLoginAccessInput {
  identity: DiscordIdentity | null
  hasAdminOverride: boolean
  isTenantOwner: boolean
}

export interface TenantLoginAccess {
  isMember: boolean
  isAdmin: boolean
}

export function resolveTenantLoginAccess(input: TenantLoginAccessInput): TenantLoginAccess {
  const isAdmin =
    (input.identity?.isAdmin ?? false) || input.hasAdminOverride || input.isTenantOwner
  const isMember =
    (input.identity?.isMember ?? false) || input.hasAdminOverride || input.isTenantOwner

  return { isMember, isAdmin }
}
