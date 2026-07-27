'use server'


import { publicActionError } from '@/lib/public-action-error'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireAnyCapability } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { CAP } from '@/lib/permissions'
import { logAdminAction } from '@/lib/admin-audit'
import {
  EVENT_REGEAR_SILVER_CAP_MAX,
  EVENT_REGEAR_SILVER_CAP_MIN,
  isValidEventRegearRolePayoutRate,
  isValidEventRegearSilverCap,
} from '@/lib/regear-event-policy'
import { normalizeRoleRewardName } from './regear-admin-types'

const EVENT_REGEAR_POLICY_CAPS = [CAP.REGEAR_EDIT_PRICE] as const
const MAX_OVERRIDE_ROWS = 80

export interface EventRegearRoleOverridePayload {
  roleName: string
  enabled: boolean
  silverCap: number | null
  payoutRatePercent: number | null
}

function normalizeNullableInteger(value: unknown): number | null | 'invalid' {
  if (value == null) return null
  if (typeof value !== 'number') return 'invalid'
  if (!Number.isInteger(value)) return 'invalid'
  return value
}

export async function updateEventRegearRoleOverrides(
  eventId: string,
  rows: EventRegearRoleOverridePayload[],
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    if (!eventId.trim()) return { error: tErr('eventNotFound') }
    if (!Array.isArray(rows) || rows.length > MAX_OVERRIDE_ROWS) {
      return { error: tErr('invalidInput') }
    }
    const db = await requireAnyCapability(EVENT_REGEAR_POLICY_CAPS)
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)

    const { data: event, error: eventError } = await db
      .from('events')
      .select('id, title')
      .eq('guild_id', guildId)
      .eq('id', eventId)
      .maybeSingle()
    if (eventError) return { error: await publicActionError(eventError, 'actions/event-regear-policy') }
    if (!event) return { error: tErr('eventNotFound') }

    const normalized = new Map<string, EventRegearRoleOverridePayload>()
    for (const row of rows) {
      const roleName = normalizeRoleRewardName(row.roleName)
      if (!roleName) return { error: tErr('invalidInput') }
      const silverCap = normalizeNullableInteger(row.silverCap)
      if (silverCap === 'invalid') return { error: tErr('invalidEventRegearSilverCap') }
      if (silverCap !== null && !isValidEventRegearSilverCap(silverCap)) {
        return { error: tErr('invalidEventRegearSilverCap') }
      }
      const payoutRatePercent = normalizeNullableInteger(row.payoutRatePercent)
      if (payoutRatePercent === 'invalid') return { error: tErr('invalidRegearPayoutRate') }
      if (payoutRatePercent !== null && !isValidEventRegearRolePayoutRate(payoutRatePercent)) {
        return { error: tErr('invalidRegearPayoutRate') }
      }
      normalized.set(roleName, {
        roleName,
        enabled: row.enabled === true,
        silverCap: row.enabled === false ? null : silverCap,
        payoutRatePercent: row.enabled === false ? null : payoutRatePercent,
      })
    }

    const persistedRows = Array.from(normalized.values()).filter(
      (row) => !row.enabled || row.silverCap !== null || row.payoutRatePercent !== null,
    )

    const { data: existingRows, error: existingError } = await db
      .from('event_regear_role_overrides')
      .select('role_name')
      .eq('guild_id', guildId)
      .eq('event_id', eventId)
    if (existingError) return { error: await publicActionError(existingError, 'actions/event-regear-policy') }

    if (persistedRows.length > 0) {
      const { error: upsertError } = await db
        .from('event_regear_role_overrides')
        .upsert(
          persistedRows.map((row) => ({
            guild_id: guildId,
            event_id: eventId,
            role_name: row.roleName,
            enabled: row.enabled,
            silver_cap: row.silverCap,
            payout_rate_percent: row.payoutRatePercent,
            updated_by: session.discordId,
            updated_at: new Date().toISOString(),
          })),
          { onConflict: 'guild_id,event_id,role_name' },
        )
      if (upsertError) return { error: await publicActionError(upsertError, 'actions/event-regear-policy') }
    }

    const persistedRoleNames = new Set(persistedRows.map((row) => row.roleName))
    const staleRoleNames = ((existingRows ?? []) as Array<{ role_name: string }>)
      .map((row) => row.role_name)
      .filter((roleName) => !persistedRoleNames.has(roleName))
    for (const roleName of staleRoleNames) {
      const { error: deleteError } = await db
        .from('event_regear_role_overrides')
        .delete()
        .eq('guild_id', guildId)
        .eq('event_id', eventId)
        .eq('role_name', roleName)
      if (deleteError) return { error: await publicActionError(deleteError, 'actions/event-regear-policy') }
    }

    revalidatePath(`/admin/dashboard/events/${eventId}`)
    revalidatePath(`/events/${eventId}`)
    revalidatePath('/regear')
    revalidatePath('/admin/dashboard/regear')
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'event.update',
      targetId: eventId,
      targetKind: 'event',
      details: {
        section: 'regear_role_overrides',
        title: event.title,
        overrideCount: persistedRows.length,
        min: EVENT_REGEAR_SILVER_CAP_MIN,
        max: EVENT_REGEAR_SILVER_CAP_MAX,
      },
    })
    return {}
  } catch (e) {
    return { error: await publicActionError(e, 'actions/event-regear-policy') }
  }
}
