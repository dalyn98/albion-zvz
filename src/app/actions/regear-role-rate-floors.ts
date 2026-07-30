'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { APPROVAL_REVIEW_CAPS } from '@/lib/admin-approval-permissions'
import { logAdminAction } from '@/lib/admin-audit'
import { requireAnyCapability } from '@/lib/auth'
import { isDiscordId } from '@/lib/discord-id'
import { publicActionError } from '@/lib/public-action-error'
import { isValidRoleRegearPayoutRate } from '@/lib/regear-payout'
import {
  loadRegearDiscordRoleRateFloorConfig,
  mapRegearDiscordRoleRateFloorRow,
} from '@/lib/regear-role-rate-floor-data'
import type { RegearDiscordRoleRateFloor } from '@/lib/regear-role-rate-floor'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { isRegearSupported } from '@/lib/regear-support-server'

const ROLE_NAME_MAX_LENGTH = 100

export type { RegearDiscordRoleRateFloor } from '@/lib/regear-role-rate-floor'

function normalizeDiscordRoleName(value: string): string | null {
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (!normalized || normalized.length > ROLE_NAME_MAX_LENGTH) return null
  if (/[\u0000-\u001f\u007f]/.test(normalized)) return null
  return normalized
}

export async function listRegearDiscordRoleRateFloors(): Promise<{
  configured: boolean
  policies: RegearDiscordRoleRateFloor[]
  error?: string
}> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { configured: false, policies: [], error: tErr('unauthorized') }
    const db = await requireAnyCapability(APPROVAL_REVIEW_CAPS)
    const guildId = await getSessionGuildId(session)
    return loadRegearDiscordRoleRateFloorConfig(db, guildId)
  } catch (error) {
    return {
      configured: false,
      policies: [],
      error: await publicActionError(error, 'actions/regear-role-rate-floors'),
    }
  }
}

export async function upsertRegearDiscordRoleRateFloor(input: {
  id?: string | null
  discordRoleId: string
  discordRoleName: string
  minimumPayoutRatePercent: number
}): Promise<{ policy?: RegearDiscordRoleRateFloor; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const roleName = normalizeDiscordRoleName(input.discordRoleName)
    if (
      !isDiscordId(input.discordRoleId) ||
      !roleName ||
      !isValidRoleRegearPayoutRate(input.minimumPayoutRatePercent)
    ) {
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
      minimum_payout_rate_percent: input.minimumPayoutRatePercent,
      updated_by: session.discordId,
      updated_at: new Date().toISOString(),
    }
    const query = input.id
      ? db
          .from('regear_discord_role_rate_floors')
          .update(row)
          .eq('guild_id', guildId)
          .eq('id', input.id)
      : db.from('regear_discord_role_rate_floors').upsert(row, {
          onConflict: 'guild_id,discord_role_id',
        })
    const { data, error } = await query
      .select(
        'id, discord_role_id, discord_role_name, minimum_payout_rate_percent, updated_at',
      )
      .single()
    if (error) {
      return { error: await publicActionError(error, 'actions/regear-role-rate-floors') }
    }
    revalidatePath('/admin/dashboard/settings')
    revalidatePath('/regear')
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'settings.update',
      targetId: data.id as string,
      targetKind: 'setting',
      details: {
        key: 'regear_discord_role_rate_floor',
        discordRoleId: input.discordRoleId,
        minimumPayoutRatePercent: input.minimumPayoutRatePercent,
      },
    })
    return {
      policy: mapRegearDiscordRoleRateFloorRow(
        data as Parameters<typeof mapRegearDiscordRoleRateFloorRow>[0],
      ),
    }
  } catch (error) {
    return { error: await publicActionError(error, 'actions/regear-role-rate-floors') }
  }
}

export async function deleteRegearDiscordRoleRateFloor(
  id: string,
): Promise<{ error?: string }> {
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
      .from('regear_discord_role_rate_floors')
      .delete()
      .eq('guild_id', guildId)
      .eq('id', id)
    if (error) {
      return { error: await publicActionError(error, 'actions/regear-role-rate-floors') }
    }
    revalidatePath('/admin/dashboard/settings')
    revalidatePath('/regear')
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'settings.update',
      targetId: id,
      targetKind: 'setting',
      details: { key: 'regear_discord_role_rate_floor', deleted: true },
    })
    return {}
  } catch (error) {
    return { error: await publicActionError(error, 'actions/regear-role-rate-floors') }
  }
}
