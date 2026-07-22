'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getTranslations } from 'next-intl/server'
import { getSession, sessionHas } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import { logAdminAction } from '@/lib/admin-audit'
import {
  ALL_CAPABILITIES,
  CAP,
  parseCapabilities,
  serializeCapabilities,
} from '@/lib/permissions'

const PERMISSIONS_PATH = '/admin/dashboard/permissions'
const POSTGRES_BIGINT_MAX_DECIMAL_LENGTH = 19

// Discord snowflake = 17-19 digit string. 잘못된 값이 PK 로 들어가는 걸 막는 보수
// 적인 검증 — 길이는 살짝 넉넉히. notes 는 운영 메모라 500자 cap.
const discordRoleIdSchema = z.string().trim().regex(/^[0-9]{17,20}$/)
const discordIdSchema = z.string().trim().regex(/^[0-9]{17,20}$/)
const notesSchema = z.string().max(500).default('')

// capabilities 는 string 형태의 BigInt. 음수/소수/16진수는 parseCapabilities 가
// 0n 으로 떨어뜨리지만, 클라이언트 입력이라 zod 단계에서 형식부터 검증.
const capabilitiesStringSchema = z
  .string()
  .trim()
  .max(POSTGRES_BIGINT_MAX_DECIMAL_LENGTH)
  .regex(/^[0-9]+$/, 'capabilities must be a non-negative decimal integer')

const upsertRoleGrantSchema = z.object({
  discordRoleId: discordRoleIdSchema,
  capabilities: capabilitiesStringSchema,
  notes: notesSchema,
})

const upsertUserOverrideSchema = z.object({
  discordId: discordIdSchema,
  capabilitiesGranted: capabilitiesStringSchema,
  capabilitiesRevoked: capabilitiesStringSchema,
  notes: notesSchema,
})

export interface RoleGrantRow {
  discordRoleId: string
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
}

export interface PermissionsListResult {
  roleGrants: RoleGrantRow[]
  userOverrides: UserOverrideRow[]
  error?: string
}

// 비트필드를 ALL_CAPABILITIES 범위 안으로 클램프 — 알려지지 않은 비트는 잘라낸다.
// 새 capability 가 추가되어도 기존 DB 값과 충돌하지 않게 하고, 클라이언트가 임의
// 비트를 부여하지 못하게 막는다.
function clampToKnownCapabilities(raw: string): string {
  const bits = parseCapabilities(raw)
  const clamped = bits & ALL_CAPABILITIES
  return serializeCapabilities(clamped)
}

export async function listPermissions(): Promise<PermissionsListResult> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session || !sessionHas(session, CAP.SETTINGS_PERMISSIONS)) {
      return { roleGrants: [], userOverrides: [], error: tErr('unauthorized') }
    }
    const db = getAdminClient()
    const guildId = await getSessionGuildId(session)

    const [rolesRes, overridesRes] = await Promise.all([
      db
        .from('permission_role_grants')
        .select(
          'discord_role_id, capabilities, granted_by_discord_id, granted_at, updated_at, notes',
        )
        .eq('guild_id', guildId)
        .order('updated_at', { ascending: false }),
      db
        .from('permission_user_overrides')
        .select(
          'discord_id, capabilities_granted, capabilities_revoked, granted_by_discord_id, granted_at, updated_at, notes',
        )
        .eq('guild_id', guildId)
        .order('updated_at', { ascending: false }),
    ])
    if (rolesRes.error) throw new Error(rolesRes.error.message)
    if (overridesRes.error) throw new Error(overridesRes.error.message)

    const roleGrants: RoleGrantRow[] = (rolesRes.data ?? []).map((r) => ({
      discordRoleId: r.discord_role_id as string,
      capabilities: String(r.capabilities ?? '0'),
      grantedByDiscordId: r.granted_by_discord_id as string,
      grantedAt: r.granted_at as string,
      updatedAt: r.updated_at as string,
      notes: (r.notes as string | null) ?? '',
    }))
    const userOverrides: UserOverrideRow[] = (overridesRes.data ?? []).map((r) => ({
      discordId: r.discord_id as string,
      capabilitiesGranted: String(r.capabilities_granted ?? '0'),
      capabilitiesRevoked: String(r.capabilities_revoked ?? '0'),
      grantedByDiscordId: r.granted_by_discord_id as string,
      grantedAt: r.granted_at as string,
      updatedAt: r.updated_at as string,
      notes: (r.notes as string | null) ?? '',
    }))

    return { roleGrants, userOverrides }
  } catch (e) {
    return {
      roleGrants: [],
      userOverrides: [],
      error: e instanceof Error ? e.message : tErr('serverError'),
    }
  }
}

export async function upsertRoleGrant(input: {
  discordRoleId: string
  capabilities: string
  notes?: string
}): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session || !sessionHas(session, CAP.SETTINGS_PERMISSIONS)) {
      return { error: tErr('unauthorized') }
    }
    const db = getAdminClient()
    const guildId = await getSessionGuildId(session)

    const parsed = upsertRoleGrantSchema.safeParse({
      ...input,
      notes: input.notes ?? '',
    })
    if (!parsed.success) return { error: tErr('invalidInput') }

    const capabilities = clampToKnownCapabilities(parsed.data.capabilities)

    const { error } = await db.from('permission_role_grants').upsert(
      {
        guild_id: guildId,
        discord_role_id: parsed.data.discordRoleId,
        // Supabase JS 는 bigint 컬럼에 number/string 모두 허용. 현재 capability
        // 비트는 모두 Number.MAX_SAFE_INTEGER 안에 들어오지만, 미래의 비트 폭증을
        // 대비해 string 으로 직접 전송.
        capabilities: capabilities,
        granted_by_discord_id: session.discordId,
        updated_at: new Date().toISOString(),
        notes: parsed.data.notes,
      },
      { onConflict: 'guild_id,discord_role_id' },
    )
    if (error) return { error: error.message }

    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'permission.role.update',
      targetId: parsed.data.discordRoleId,
      targetKind: 'permission_role',
      details: { capabilities, notes: parsed.data.notes },
    })

    revalidatePath(PERMISSIONS_PATH)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function deleteRoleGrant(
  discordRoleId: string,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session || !sessionHas(session, CAP.SETTINGS_PERMISSIONS)) {
      return { error: tErr('unauthorized') }
    }
    const db = getAdminClient()
    const guildId = await getSessionGuildId(session)

    const parsed = discordRoleIdSchema.safeParse(discordRoleId)
    if (!parsed.success) return { error: tErr('invalidInput') }

    const { data, error } = await db
      .from('permission_role_grants')
      .delete()
      .eq('guild_id', guildId)
      .eq('discord_role_id', parsed.data)
      .select('discord_role_id')
    if (error) return { error: error.message }
    if (!data || data.length === 0) {
      // race-condition: 이미 다른 admin 이 삭제. UI 에서 새로고침하면 정합 맞음.
      return {}
    }

    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'permission.role.delete',
      targetId: parsed.data,
      targetKind: 'permission_role',
    })

    revalidatePath(PERMISSIONS_PATH)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function upsertUserOverride(input: {
  discordId: string
  capabilitiesGranted: string
  capabilitiesRevoked: string
  notes?: string
}): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session || !sessionHas(session, CAP.SETTINGS_PERMISSIONS)) {
      return { error: tErr('unauthorized') }
    }
    const db = getAdminClient()
    const guildId = await getSessionGuildId(session)

    const parsed = upsertUserOverrideSchema.safeParse({
      ...input,
      notes: input.notes ?? '',
    })
    if (!parsed.success) return { error: tErr('invalidInput') }

    const granted = clampToKnownCapabilities(parsed.data.capabilitiesGranted)
    const revoked = clampToKnownCapabilities(parsed.data.capabilitiesRevoked)
    const grantedBits = parseCapabilities(granted)
    const revokedBits = parseCapabilities(revoked)
    if ((grantedBits & revokedBits) !== 0n) {
      return { error: tErr('permissionConflict') }
    }
    if (
      parsed.data.discordId === session.discordId &&
      (revokedBits & CAP.SETTINGS_PERMISSIONS) !== 0n
    ) {
      return { error: tErr('selfLockout') }
    }

    const { error } = await db.from('permission_user_overrides').upsert(
      {
        guild_id: guildId,
        discord_id: parsed.data.discordId,
        capabilities_granted: granted,
        capabilities_revoked: revoked,
        granted_by_discord_id: session.discordId,
        updated_at: new Date().toISOString(),
        notes: parsed.data.notes,
      },
      { onConflict: 'guild_id,discord_id' },
    )
    if (error) return { error: error.message }

    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'permission.user.update',
      targetId: parsed.data.discordId,
      targetKind: 'permission_user',
      targetDiscordId: parsed.data.discordId,
      details: { granted, revoked, notes: parsed.data.notes },
    })

    revalidatePath(PERMISSIONS_PATH)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function deleteUserOverride(
  discordId: string,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session || !sessionHas(session, CAP.SETTINGS_PERMISSIONS)) {
      return { error: tErr('unauthorized') }
    }
    const db = getAdminClient()
    const guildId = await getSessionGuildId(session)

    const parsed = discordIdSchema.safeParse(discordId)
    if (!parsed.success) return { error: tErr('invalidInput') }

    const { data, error } = await db
      .from('permission_user_overrides')
      .delete()
      .eq('guild_id', guildId)
      .eq('discord_id', parsed.data)
      .select('discord_id')
    if (error) return { error: error.message }
    if (!data || data.length === 0) return {}

    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'permission.user.delete',
      targetId: parsed.data,
      targetKind: 'permission_user',
      targetDiscordId: parsed.data,
    })

    revalidatePath(PERMISSIONS_PATH)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}
