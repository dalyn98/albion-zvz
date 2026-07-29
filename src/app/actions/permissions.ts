'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { requireLiveSession } from '@/lib/auth'
import { discordAvatarUrl } from '@/lib/discord-avatar-url'
import {
  getGuildMemberByBot,
  listGuildMembersBulk,
} from '@/lib/discord'
import {
  fetchDiscordGuildRoles,
  type RawDiscordRole,
} from '@/lib/discord-guild-resources'
import { resolveDiscordAuthorization } from '@/lib/discord-live-authorization'
import { invalidateAppSettingsCache } from '@/lib/app-settings-invalidation'
import {
  ALL_CAPABILITIES,
  CAP,
  parseCapabilities,
  serializeCapabilities,
} from '@/lib/permissions'
import { publicActionError } from '@/lib/public-action-error'
import {
  SESSION_COOKIE_NAME,
  cookieOptions,
  sessionHas,
  signSession,
  type SessionPayload,
} from '@/lib/session'
import { isSuperAdmin } from '@/lib/super-admin'
import { getAdminClient } from '@/lib/supabase-admin'
import {
  getSessionGuildId,
  getTenantDiscordConfig,
} from '@/lib/tenant'
import { invalidateTenantDirectoryCache } from '@/lib/tenant-cache'

const PERMISSIONS_PATH = '/admin/dashboard/permissions'
const POSTGRES_BIGINT_MAX_DECIMAL_LENGTH = 19
const MAX_OVERRIDE_DAYS = 30

const discordSnowflakeSchema = z.string().trim().regex(/^[0-9]{17,20}$/)
const roleNameSchema = z.string().trim().min(1).max(100)
const notesSchema = z.string().max(500).default('')
const reasonSchema = z.string().trim().min(5).max(500)
const expectedUpdatedAtSchema = z.string().datetime().nullable().default(null)
const capabilitiesStringSchema = z
  .string()
  .trim()
  .max(POSTGRES_BIGINT_MAX_DECIMAL_LENGTH)
  .regex(/^[0-9]+$/)

const upsertRoleGrantSchema = z.object({
  discordRoleId: discordSnowflakeSchema,
  discordRoleName: roleNameSchema,
  capabilities: capabilitiesStringSchema,
  notes: notesSchema,
  expectedUpdatedAt: expectedUpdatedAtSchema,
})

const deleteRoleGrantSchema = z.object({
  discordRoleId: discordSnowflakeSchema,
  expectedUpdatedAt: z.string().datetime(),
})

const upsertUserOverrideSchema = z.object({
  discordId: discordSnowflakeSchema,
  capabilitiesGranted: capabilitiesStringSchema,
  capabilitiesRevoked: capabilitiesStringSchema,
  reason: reasonSchema,
  expiresAt: z.string().datetime(),
  notes: notesSchema,
  expectedUpdatedAt: expectedUpdatedAtSchema,
})

const revokeUserOverrideSchema = z.object({
  discordId: discordSnowflakeSchema,
  expectedUpdatedAt: z.string().datetime(),
  revokeReason: reasonSchema,
})

export interface RoleGrantRow {
  discordRoleId: string
  discordRoleName: string
  capabilities: string
  grantedByDiscordId: string
  grantedAt: string
  updatedAt: string
  notes: string
}

export interface UserOverrideRow {
  discordId: string
  capabilitiesGranted: string
  capabilitiesRevoked: string
  grantedByDiscordId: string
  grantedAt: string
  updatedAt: string
  notes: string
  reason: string
  expiresAt: string
  revokedAt: string | null
  revokedByDiscordId: string | null
  revokedReason: string | null
  status: 'active' | 'expired' | 'revoked'
}

export interface PermissionRoleOption {
  id: string
  name: string
  color: number
  position: number
  memberCount: number
}

export interface PermissionMemberOption {
  id: string
  name: string
  avatarUrl: string | null
}

export interface PermissionDirectoryResult {
  roles: PermissionRoleOption[]
  members: PermissionMemberOption[]
  error?: string
}

export interface PermissionsListResult {
  roleGrants: RoleGrantRow[]
  userOverrides: UserOverrideRow[]
  error?: string
}

function clampToKnownCapabilities(raw: string): string {
  return serializeCapabilities(parseCapabilities(raw) & ALL_CAPABILITIES)
}

function overrideStatus(row: {
  revoked_at?: string | null
  expires_at?: string | null
}): UserOverrideRow['status'] {
  if (row.revoked_at) return 'revoked'
  const expiresAt = Date.parse(row.expires_at ?? '')
  return Number.isFinite(expiresAt) && expiresAt > Date.now()
    ? 'active'
    : 'expired'
}

async function requirePermissionOperator(): Promise<SessionPayload> {
  const session = await requireLiveSession()
  if (!sessionHas(session, CAP.SETTINGS_PERMISSIONS)) {
    throw new Error('Unauthorized')
  }
  return session
}

function isOptimisticConflict(error: unknown): boolean {
  const message =
    typeof error === 'object' && error && 'message' in error
      ? String(error.message)
      : ''
  return (
    message.includes('PERMISSION_ROLE_CONFLICT') ||
    message.includes('PERMISSION_OVERRIDE_CONFLICT')
  )
}

function activeDiscordRoles(
  roles: readonly RawDiscordRole[],
  discordGuildId: string,
): RawDiscordRole[] {
  return roles.filter(
    (role) => role.id !== discordGuildId && !role.managed,
  )
}

async function loadPermissionDirectory(
  discordGuildId: string,
): Promise<PermissionDirectoryResult> {
  const [rawRoles, discordMembers] = await Promise.all([
    fetchDiscordGuildRoles(discordGuildId),
    listGuildMembersBulk(discordGuildId),
  ])
  const countByRole = new Map<string, number>()
  for (const member of discordMembers) {
    for (const roleId of member.roles) {
      countByRole.set(roleId, (countByRole.get(roleId) ?? 0) + 1)
    }
  }

  const roles = activeDiscordRoles(rawRoles, discordGuildId)
    .map((role) => ({
      id: role.id,
      name: role.name,
      color: role.color,
      position: role.position,
      memberCount: countByRole.get(role.id) ?? 0,
    }))
    .sort((a, b) => b.position - a.position || a.name.localeCompare(b.name))

  const members = discordMembers
    .filter((member) => member.user && !member.user.bot)
    .map((member) => {
      const user = member.user!
      return {
        id: user.id,
        name:
          member.nick ||
          user.global_name ||
          user.username ||
          user.id,
        avatarUrl: discordAvatarUrl(user.id, user.avatar, 32),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  return { roles, members }
}

async function refreshOperatorSession(
  session: SessionPayload,
  guildId: string,
): Promise<void> {
  // A platform super-admin may be impersonating a guild they did not join.
  // Their separate allowlist session is not derived from Discord member roles.
  if (isSuperAdmin(session.discordId)) return

  const tenant = await getTenantDiscordConfig(guildId)
  if (!tenant) throw new Error('Tenant not found')
  const member = await getGuildMemberByBot(
    tenant.discordGuildId,
    session.discordId,
  )
  if (!member) throw new Error('Unauthorized')
  const authorization = await resolveDiscordAuthorization({
    tenant,
    discordId: session.discordId,
    member,
    previousSession: session,
    issuedAt: Date.now(),
  })
  if (!authorization) throw new Error('Unauthorized')

  const cookieStore = await cookies()
  cookieStore.set(
    SESSION_COOKIE_NAME,
    await signSession(authorization.session),
    cookieOptions(),
  )
}

function invalidatePermissionViews(guildId: string): void {
  invalidateAppSettingsCache(guildId)
  invalidateTenantDirectoryCache()
  revalidatePath(PERMISSIONS_PATH)
  revalidatePath('/admin/dashboard/settings')
}

export async function listPermissions(): Promise<PermissionsListResult> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await requirePermissionOperator()
    const db = getAdminClient()
    const guildId = await getSessionGuildId(session)
    const [rolesRes, overridesRes] = await Promise.all([
      db
        .from('permission_role_grants')
        .select(
          'discord_role_id, discord_role_name, capabilities, granted_by_discord_id, granted_at, updated_at, notes',
        )
        .eq('guild_id', guildId)
        .order('updated_at', { ascending: false }),
      db
        .from('permission_user_overrides')
        .select(
          'discord_id, capabilities_granted, capabilities_revoked, granted_by_discord_id, granted_at, updated_at, notes, reason, expires_at, revoked_at, revoked_by_discord_id, revoked_reason',
        )
        .eq('guild_id', guildId)
        .order('updated_at', { ascending: false }),
    ])
    if (rolesRes.error) throw new Error(rolesRes.error.message)
    if (overridesRes.error) throw new Error(overridesRes.error.message)

    return {
      roleGrants: (rolesRes.data ?? []).map((row) => ({
        discordRoleId: row.discord_role_id as string,
        discordRoleName: row.discord_role_name as string,
        capabilities: String(row.capabilities ?? '0'),
        grantedByDiscordId: row.granted_by_discord_id as string,
        grantedAt: row.granted_at as string,
        updatedAt: row.updated_at as string,
        notes: (row.notes as string | null) ?? '',
      })),
      userOverrides: (overridesRes.data ?? []).map((row) => ({
        discordId: row.discord_id as string,
        capabilitiesGranted: String(row.capabilities_granted ?? '0'),
        capabilitiesRevoked: String(row.capabilities_revoked ?? '0'),
        grantedByDiscordId: row.granted_by_discord_id as string,
        grantedAt: row.granted_at as string,
        updatedAt: row.updated_at as string,
        notes: (row.notes as string | null) ?? '',
        reason: row.reason as string,
        expiresAt: row.expires_at as string,
        revokedAt: (row.revoked_at as string | null) ?? null,
        revokedByDiscordId:
          (row.revoked_by_discord_id as string | null) ?? null,
        revokedReason: (row.revoked_reason as string | null) ?? null,
        status: overrideStatus(row),
      })),
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return {
        roleGrants: [],
        userOverrides: [],
        error: tErr('unauthorized'),
      }
    }
    return {
      roleGrants: [],
      userOverrides: [],
      error: await publicActionError(error, 'actions/permissions.list'),
    }
  }
}

export async function listPermissionDirectory(): Promise<PermissionDirectoryResult> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await requirePermissionOperator()
    const guildId = await getSessionGuildId(session)
    const tenant = await getTenantDiscordConfig(guildId)
    if (!tenant) return { roles: [], members: [], error: tErr('serverError') }
    return await loadPermissionDirectory(tenant.discordGuildId)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return { roles: [], members: [], error: tErr('unauthorized') }
    }
    return {
      roles: [],
      members: [],
      error: await publicActionError(error, 'actions/permissions.directory'),
    }
  }
}

export async function upsertRoleGrant(input: {
  discordRoleId: string
  discordRoleName: string
  capabilities: string
  notes?: string
  expectedUpdatedAt?: string | null
}): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const parsed = upsertRoleGrantSchema.safeParse({
      ...input,
      notes: input.notes ?? '',
      expectedUpdatedAt: input.expectedUpdatedAt ?? null,
    })
    if (!parsed.success) return { error: tErr('invalidInput') }

    const session = await requirePermissionOperator()
    const guildId = await getSessionGuildId(session)
    const tenant = await getTenantDiscordConfig(guildId)
    if (!tenant) return { error: tErr('serverError') }

    const directory = await loadPermissionDirectory(tenant.discordGuildId)
    const role = directory.roles.find(
      (candidate) => candidate.id === parsed.data.discordRoleId,
    )
    if (!role || role.name !== parsed.data.discordRoleName) {
      return { error: tErr('invalidInput') }
    }

    const capabilities = clampToKnownCapabilities(parsed.data.capabilities)
    if (parseCapabilities(capabilities) === 0n) {
      return { error: tErr('invalidInput') }
    }
    const db = getAdminClient()
    const { error } = await db.rpc('apply_permission_role_grant', {
      p_guild_id: guildId,
      p_discord_role_id: role.id,
      p_discord_role_name: role.name,
      p_capabilities: capabilities,
      p_actor_discord_id: session.discordId,
      p_notes: parsed.data.notes,
      p_expected_updated_at: parsed.data.expectedUpdatedAt,
      p_affected_member_count: role.memberCount,
      p_delete: false,
    })
    if (error) {
      return {
        error: isOptimisticConflict(error)
          ? tErr('serverActionExpired')
          : await publicActionError(error, 'actions/permissions.role.upsert'),
      }
    }

    invalidatePermissionViews(guildId)
    await refreshOperatorSession(session, guildId)
    return {}
  } catch (error) {
    return {
      error: await publicActionError(error, 'actions/permissions.role.upsert'),
    }
  }
}

export async function deleteRoleGrant(input: {
  discordRoleId: string
  expectedUpdatedAt: string
}): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const parsed = deleteRoleGrantSchema.safeParse(input)
    if (!parsed.success) return { error: tErr('invalidInput') }

    const session = await requirePermissionOperator()
    const guildId = await getSessionGuildId(session)
    const db = getAdminClient()
    const { data: row, error: rowError } = await db
      .from('permission_role_grants')
      .select('discord_role_name, capabilities')
      .eq('guild_id', guildId)
      .eq('discord_role_id', parsed.data.discordRoleId)
      .maybeSingle()
    if (rowError) throw new Error(rowError.message)
    if (!row) return {}

    const tenant = await getTenantDiscordConfig(guildId)
    if (!tenant) return { error: tErr('serverError') }
    const members = await listGuildMembersBulk(tenant.discordGuildId)
    const affectedMemberCount = members.reduce(
      (count, member) =>
        count +
        (member.roles.includes(parsed.data.discordRoleId) ? 1 : 0),
      0,
    )
    const { error } = await db.rpc('apply_permission_role_grant', {
      p_guild_id: guildId,
      p_discord_role_id: parsed.data.discordRoleId,
      p_discord_role_name: row.discord_role_name as string,
      p_capabilities: String(row.capabilities ?? '0'),
      p_actor_discord_id: session.discordId,
      p_notes: '',
      p_expected_updated_at: parsed.data.expectedUpdatedAt,
      p_affected_member_count: affectedMemberCount,
      p_delete: true,
    })
    if (error) {
      return {
        error: isOptimisticConflict(error)
          ? tErr('serverActionExpired')
          : await publicActionError(error, 'actions/permissions.role.delete'),
      }
    }

    invalidatePermissionViews(guildId)
    await refreshOperatorSession(session, guildId)
    return {}
  } catch (error) {
    return {
      error: await publicActionError(error, 'actions/permissions.role.delete'),
    }
  }
}

export async function upsertUserOverride(input: {
  discordId: string
  capabilitiesGranted: string
  capabilitiesRevoked: string
  reason: string
  expiresAt: string
  notes?: string
  expectedUpdatedAt?: string | null
}): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const parsed = upsertUserOverrideSchema.safeParse({
      ...input,
      notes: input.notes ?? '',
      expectedUpdatedAt: input.expectedUpdatedAt ?? null,
    })
    if (!parsed.success) return { error: tErr('invalidInput') }

    const expiresAt = new Date(parsed.data.expiresAt)
    const lifetimeMs = expiresAt.getTime() - Date.now()
    if (
      lifetimeMs < 15 * 60 * 1000 ||
      lifetimeMs > MAX_OVERRIDE_DAYS * 24 * 60 * 60 * 1000
    ) {
      return { error: tErr('invalidInput') }
    }

    const granted = clampToKnownCapabilities(
      parsed.data.capabilitiesGranted,
    )
    const revoked = clampToKnownCapabilities(
      parsed.data.capabilitiesRevoked,
    )
    const grantedBits = parseCapabilities(granted)
    const revokedBits = parseCapabilities(revoked)
    if ((grantedBits & revokedBits) !== 0n) {
      return { error: tErr('permissionConflict') }
    }
    if (grantedBits === 0n && revokedBits === 0n) {
      return { error: tErr('invalidInput') }
    }

    const session = await requirePermissionOperator()
    if (
      parsed.data.discordId === session.discordId &&
      (revokedBits & (CAP.SETTINGS_PERMISSIONS | CAP.GUILD_ADMIN)) !== 0n
    ) {
      return { error: tErr('selfLockout') }
    }

    const guildId = await getSessionGuildId(session)
    const tenant = await getTenantDiscordConfig(guildId)
    if (!tenant) return { error: tErr('serverError') }
    const target = await getGuildMemberByBot(
      tenant.discordGuildId,
      parsed.data.discordId,
    )
    // This both prevents local-account capability grants and refuses stale
    // Discord IDs that are no longer members of the configured server.
    if (
      !target?.user ||
      target.user.id !== parsed.data.discordId ||
      target.user.bot
    ) {
      return { error: tErr('memberNotFound') }
    }

    const db = getAdminClient()
    const [roleGrantResult, adminOverrideResult] = await Promise.all([
      target.roles.length > 0
        ? db
            .from('permission_role_grants')
            .select('capabilities')
            .eq('guild_id', guildId)
            .in('discord_role_id', target.roles)
        : Promise.resolve({ data: [], error: null }),
      db
        .from('tenant_admin_overrides')
        .select('discord_id')
        .eq('tenant_id', guildId)
        .eq('discord_id', parsed.data.discordId)
        .maybeSingle(),
    ])
    if (roleGrantResult.error) throw new Error(roleGrantResult.error.message)
    if (adminOverrideResult.error) {
      throw new Error(adminOverrideResult.error.message)
    }
    const targetRoleBits = (roleGrantResult.data ?? []).reduce(
      (bits, row) =>
        bits | parseCapabilities(String(row.capabilities ?? '0')),
      0n,
    )
    const isBootstrapAdmin =
      tenant.createdByDiscordId === parsed.data.discordId ||
      !!adminOverrideResult.data
    if (revokedBits !== 0n && isBootstrapAdmin) {
      return { error: tErr('permissionConflict') }
    }
    const hasFullAdminSource =
      (targetRoleBits & CAP.GUILD_ADMIN) !== 0n ||
      (grantedBits & CAP.GUILD_ADMIN) !== 0n
    if (
      hasFullAdminSource &&
      revokedBits !== 0n &&
      (revokedBits & CAP.GUILD_ADMIN) === 0n
    ) {
      return { error: tErr('permissionConflict') }
    }

    const { error } = await db.rpc('apply_permission_user_override', {
      p_guild_id: guildId,
      p_discord_id: parsed.data.discordId,
      p_capabilities_granted: granted,
      p_capabilities_revoked: revoked,
      p_reason: parsed.data.reason,
      p_expires_at: expiresAt.toISOString(),
      p_actor_discord_id: session.discordId,
      p_notes: parsed.data.notes,
      p_expected_updated_at: parsed.data.expectedUpdatedAt,
      p_revoke: false,
      p_revoke_reason: '',
    })
    if (error) {
      return {
        error: isOptimisticConflict(error)
          ? tErr('serverActionExpired')
          : await publicActionError(error, 'actions/permissions.user.upsert'),
      }
    }

    invalidatePermissionViews(guildId)
    if (parsed.data.discordId === session.discordId) {
      await refreshOperatorSession(session, guildId)
    }
    return {}
  } catch (error) {
    return {
      error: await publicActionError(error, 'actions/permissions.user.upsert'),
    }
  }
}

export async function revokeUserOverride(input: {
  discordId: string
  expectedUpdatedAt: string
  revokeReason: string
}): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const parsed = revokeUserOverrideSchema.safeParse(input)
    if (!parsed.success) return { error: tErr('invalidInput') }

    const session = await requirePermissionOperator()
    const guildId = await getSessionGuildId(session)
    const db = getAdminClient()
    const { data: row, error: rowError } = await db
      .from('permission_user_overrides')
      .select(
        'capabilities_granted, capabilities_revoked, reason, expires_at, notes',
      )
      .eq('guild_id', guildId)
      .eq('discord_id', parsed.data.discordId)
      .maybeSingle()
    if (rowError) throw new Error(rowError.message)
    if (!row) return {}

    const { error } = await db.rpc('apply_permission_user_override', {
      p_guild_id: guildId,
      p_discord_id: parsed.data.discordId,
      p_capabilities_granted: String(row.capabilities_granted ?? '0'),
      p_capabilities_revoked: String(row.capabilities_revoked ?? '0'),
      p_reason: row.reason as string,
      p_expires_at: row.expires_at as string,
      p_actor_discord_id: session.discordId,
      p_notes: (row.notes as string | null) ?? '',
      p_expected_updated_at: parsed.data.expectedUpdatedAt,
      p_revoke: true,
      p_revoke_reason: parsed.data.revokeReason,
    })
    if (error) {
      return {
        error: isOptimisticConflict(error)
          ? tErr('serverActionExpired')
          : await publicActionError(error, 'actions/permissions.user.revoke'),
      }
    }

    invalidatePermissionViews(guildId)
    if (parsed.data.discordId === session.discordId) {
      await refreshOperatorSession(session, guildId)
    }
    return {}
  } catch (error) {
    return {
      error: await publicActionError(error, 'actions/permissions.user.revoke'),
    }
  }
}
