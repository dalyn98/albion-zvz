import 'server-only'

import { getTranslations } from 'next-intl/server'
import { sendLocalizedDiscordDmToUser } from '@/lib/discord-dm-localized'
import { getLocalizedItemName, stripLocalizedTierName } from '@/lib/item-names'
import { log } from '@/lib/log'
import { getAdminClient } from '@/lib/supabase-admin'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import { formatTentativeSlotRecommendationLabel } from '@/lib/event-tentative-recommendation'
import type { TentativeSlotRecommendationOption } from '@/lib/event-tentative-signups'

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
    await sendLocalizedDiscordDmToUser(discordId, guildId, async (_tDm, locale) => {
      const tEvent = await getTranslations({ locale, namespace: 'eventTentative' })
      const weaponName = stripLocalizedTierName(
        getLocalizedItemName(slot.weaponId, locale, slot.weaponName),
        locale,
      ) || translateSlotRole(slot.roleName)
      const slotLabel = formatTentativeSlotRecommendationLabel(slot, weaponName)
      return {
        title: tEvent('recommendationSaved'),
        body: `${eventTitle}\n${tEvent('recommendationBadge', { slot: slotLabel })}`,
        url: `/events/${eventId}`,
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
