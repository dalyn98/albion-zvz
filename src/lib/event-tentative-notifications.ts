import 'server-only'

import { getTranslations } from 'next-intl/server'
import { sendLocalizedDiscordDmToUser } from '@/lib/discord-dm-localized'
import { getLocalizedItemName, stripLocalizedTierName } from '@/lib/item-names'
import { log } from '@/lib/log'
import { getAdminClient } from '@/lib/supabase-admin'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import { formatTentativeSlotRecommendationLabel } from '@/lib/event-tentative-recommendation'
import type { TentativeSlotRecommendationOption } from '@/lib/event-tentative-signups'
import { getTenantDiscordConfig } from '@/lib/tenant'
import { tenantUrl } from '@/lib/tenant-resolver'

interface RecommendationNotificationInput {
  guildId: string
  eventId: string
  eventTitle: string
  discordId: string
  slotId: string
}

interface RecommendationSlotRow {
  id: string
  slot_number: number
  role_name: string | null
  weapon_id: string | null
  weapon_name: string | null
  parties:
    | { event_id: string; party_number: number; name: string | null; is_bomb_squad: boolean }
    | Array<{ event_id: string; party_number: number; name: string | null; is_bomb_squad: boolean }>
    | null
}

function recommendationOptionFromRow(
  row: RecommendationSlotRow,
): TentativeSlotRecommendationOption | null {
  const party = Array.isArray(row.parties) ? row.parties[0] : row.parties
  if (!party || !row.role_name) return null
  return {
    id: row.id,
    partyNumber: party.party_number,
    partyName: party.is_bomb_squad ? party.name?.trim() || null : null,
    slotNumber: row.slot_number,
    roleName: row.role_name as TentativeSlotRecommendationOption['roleName'],
    weaponId: row.weapon_id,
    weaponName: row.weapon_name,
  }
}

export async function sendTentativeSlotRecommendationNotification({
  guildId,
  eventId,
  eventTitle,
  discordId,
  slotId,
}: RecommendationNotificationInput): Promise<void> {
  const db = getAdminClient()
  const { data, error } = await db
    .from('slots')
    .select(
      'id, slot_number, role_name, weapon_id, weapon_name, parties!inner(event_id, party_number, name, is_bomb_squad)',
    )
    .eq('guild_id', guildId)
    .eq('id', slotId)
    .eq('parties.event_id', eventId)
    .maybeSingle()

  if (error || !data) {
    log.error('[event-tentative] recommendation notification slot lookup failed', error, {
      guild_id: guildId,
      event_id: eventId,
      slot_id: slotId,
      discord_id: discordId,
    })
    return
  }

  const slot = recommendationOptionFromRow(data as RecommendationSlotRow)
  if (!slot) {
    log.warn('[event-tentative] recommendation notification slot payload invalid', {
      guild_id: guildId,
      event_id: eventId,
      slot_id: slotId,
      discord_id: discordId,
    })
    return
  }

  try {
    const tenant = await getTenantDiscordConfig(guildId)
    if (!tenant) {
      log.warn('[event-tentative] recommendation notification tenant missing', {
        guild_id: guildId,
        event_id: eventId,
        discord_id: discordId,
      })
      return
    }
    // 알림은 늦게 열 수도 있으므로 5분짜리 one-time 로그인 URL 대신 만료되지
    // 않는 tenant URL 을 쓴다. 미로그인 상태면 각 페이지의 기존 로그인 흐름이
    // 원래 목적지로 돌려보낸다.
    const eventUrl = tenantUrl(tenant.slug, `/events/${eventId}`)
    const settingsUrl = tenantUrl(tenant.slug, '/me/settings#discord-dm')
    await sendLocalizedDiscordDmToUser(discordId, guildId, async (_tDm, locale) => {
      const [tEvent, tNav] = await Promise.all([
        getTranslations({ locale, namespace: 'eventTentative' }),
        getTranslations({ locale, namespace: 'nav' }),
      ])
      const weaponName = stripLocalizedTierName(
        getLocalizedItemName(slot.weaponId, locale, slot.weaponName),
        locale,
      ) || translateSlotRole(slot.roleName)
      const slotLabel = formatTentativeSlotRecommendationLabel(slot, weaponName)
      return {
        title: tEvent('recommendationSaved'),
        body: `${eventTitle}\n${tEvent('recommendationBadge', { slot: slotLabel })}`,
        actions: [
          { label: tNav('events'), url: eventUrl },
          { label: tNav('settings'), url: settingsUrl },
        ],
      }
    })
  } catch (error) {
    log.error('[event-tentative] recommendation notification failed', error, {
      guild_id: guildId,
      event_id: eventId,
      slot_id: slotId,
      discord_id: discordId,
    })
  }
}
