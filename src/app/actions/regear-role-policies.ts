'use server'


import { publicActionError } from '@/lib/public-action-error'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireAnyCapability } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { APPROVAL_REVIEW_CAPS } from '@/lib/admin-approval-permissions'
import { isDiscordId } from '@/lib/discord-id'
import { isPostgresNonNegativeInt } from '@/lib/postgres-int'
import { logAdminAction } from '@/lib/admin-audit'
import { isValidRoleRegearPayoutRate } from '@/lib/regear-payout'
import { isRegearRoleGroup, type RegearRoleGroup } from '@/lib/regear-role-policy'
import {
  loadRegearDiscordRolePolicyConfig,
  type RegearDiscordRolePolicy,
} from '@/lib/regear-role-policy-data'
import { isRegearSupported } from '@/lib/regear-support-server'

const ROLE_NAME_MAX_LENGTH = 100

export type { RegearDiscordRolePolicy } from '@/lib/regear-role-policy-data'

function normalizeDiscordRoleName(value: string): string | null {
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (!normalized || normalized.length > ROLE_NAME_MAX_LENGTH) return null
  if (/[\u0000-\u001f\u007f]/.test(normalized)) return null
  return normalized
}

export async function listRegearDiscordRolePolicies(): Promise<{
  enabled: boolean
  policies: RegearDiscordRolePolicy[]
  error?: string
}> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { enabled: false, policies: [], error: tErr('unauthorized') }
    const db = await requireAnyCapability(APPROVAL_REVIEW_CAPS)
    const guildId = await getSessionGuildId(session)
    const config = await loadRegearDiscordRolePolicyConfig(db, guildId)
    return config
  } catch (error) {
    return {
      enabled: false,
      policies: [],
      error: await publicActionError(error, 'actions/regear-role-policies'),
    }
  }
}

export async function upsertRegearDiscordRolePolicy(input: {
  id?: string | null
  discordRoleId: string
  discordRoleName: string
  roleGroup: RegearRoleGroup
  silverCap: number
  payoutRatePercent: number
}): Promise<{ policy?: RegearDiscordRolePolicy; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const roleName = normalizeDiscordRoleName(input.discordRoleName)
    if (!isDiscordId(input.discordRoleId) || !roleName || !isRegearRoleGroup(input.roleGroup)) {
      return { error: tErr('invalidInput') }
    }
    if (!isPostgresNonNegativeInt(input.silverCap)) {
      return { error: tErr('nonNegativeInteger') }
    }
    if (!isValidRoleRegearPayoutRate(input.payoutRatePercent)) {
      return { error: tErr('invalidInput') }
    }
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireAnyCapability(APPROVAL_REVIEW_CAPS)
    const guildId = await getSessionGuildId(session)
    if (!(await isRegearSupported(guildId))) {
      return { error: tErr('regearSupportDisabled') }
    }

    const row = {
      guild_id: guildId,
      discord_role_id: input.discordRoleId,
      discord_role_name: roleName,
      regear_role_group: input.roleGroup,
      silver_cap: input.silverCap,
      payout_rate_percent: input.payoutRatePercent,
      updated_by: session.discordId,
      updated_at: new Date().toISOString(),
    }
    const query = input.id
      ? db
          .from('regear_discord_role_policies')
          .update(row)
          .eq('guild_id', guildId)
          .eq('id', input.id)
      : db.from('regear_discord_role_policies').upsert(row, {
          onConflict: 'guild_id,discord_role_id',
        })
    const { data, error } = await query
      .select('id, discord_role_id, discord_role_name, regear_role_group, silver_cap, payout_rate_percent, updated_at')
      .single()
    if (error) return { error: await publicActionError(error, 'actions/regear-role-policies') }
    revalidatePath('/admin/dashboard/settings')
    revalidatePath('/regear')
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'settings.update',
      targetId: (data as { id: string }).id,
      targetKind: 'setting',
      details: {
        key: 'regear_discord_role_policy',
        discordRoleId: input.discordRoleId,
        roleGroup: input.roleGroup,
        silverCap: input.silverCap,
        payoutRatePercent: input.payoutRatePercent,
      },
    })
    return {
      policy: {
        id: data.id as string,
        discordRoleId: data.discord_role_id as string,
        discordRoleName: data.discord_role_name as string,
        roleGroup: data.regear_role_group as RegearRoleGroup,
        silverCap: data.silver_cap as number,
        payoutRatePercent: data.payout_rate_percent as number,
        updatedAt: data.updated_at as string,
      },
    }
  } catch (error) {
    return { error: await publicActionError(error, 'actions/regear-role-policies') }
  }
}

export async function deleteRegearDiscordRolePolicy(id: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireAnyCapability(APPROVAL_REVIEW_CAPS)
    const guildId = await getSessionGuildId(session)
    if (!(await isRegearSupported(guildId))) {
      return { error: tErr('regearSupportDisabled') }
    }
    const { error } = await db
      .from('regear_discord_role_policies')
      .delete()
      .eq('guild_id', guildId)
      .eq('id', id)
    if (error) return { error: await publicActionError(error, 'actions/regear-role-policies') }
    revalidatePath('/admin/dashboard/settings')
    revalidatePath('/regear')
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'settings.update',
      targetId: id,
      targetKind: 'setting',
      details: { key: 'regear_discord_role_policy', deleted: true },
    })
    return {}
  } catch (error) {
    return { error: await publicActionError(error, 'actions/regear-role-policies') }
  }
}
