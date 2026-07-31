import type { DiscordDmPayload } from '@/lib/discord-dm'
import type { DiscordDmTranslator } from '@/lib/discord-dm-localized'

function text(payload: Record<string, unknown>, key: string, fallback = '-'): string {
  const value = payload[key]
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function integer(payload: Record<string, unknown>, key: string): number {
  const value = Number(payload[key] ?? 0)
  return Number.isSafeInteger(value) && value >= 0 ? value : 0
}

function formattedInteger(payload: Record<string, unknown>, key: string): string {
  return integer(payload, key).toLocaleString('en-US')
}

export function buildDomainMemberDm(input: {
  topic: string
  payload: Record<string, unknown>
  deliveryNonce: string
  t: DiscordDmTranslator
}): DiscordDmPayload | null {
  const common = {
    url: '/craft/my-tasks',
    deliveryNonce: input.deliveryNonce,
  }
  if (input.topic === 'craft.ready_for_pickup') {
    return {
      ...common,
      title: input.t('craftDeliveredTitle'),
      body: input.t('craftDeliveredBody', {
        event: text(input.payload, 'eventTitle'),
        box: integer(input.payload, 'boxNumber'),
        crafter: text(input.payload, 'crafterUsername'),
      }),
    }
  }
  if (input.topic === 'craft.box_moved') {
    return {
      ...common,
      title: input.t('craftBoxMovedTitle'),
      body: input.t('craftBoxMovedBody', {
        oldBox: integer(input.payload, 'oldBoxNumber'),
        newBox: integer(input.payload, 'newBoxNumber'),
      }),
    }
  }
  if (input.topic === 'craft.unclaimed_returned') {
    return {
      ...common,
      title: input.t('craftUnclaimedReturnedTitle'),
      body: input.t('craftUnclaimedReturnedBody'),
    }
  }
  if (input.topic === 'craft.pickup_overdue') {
    return {
      ...common,
      title: input.t('craftPickupOverdueTitle'),
      body: input.t('craftPickupOverdueBody'),
    }
  }
  if (input.topic === 'craft.settlement_paid') {
    return {
      ...common,
      title: input.t('craftSettlementPaidTitle'),
      body: input.t('craftSettlementPaidBody', {
        count: integer(input.payload, 'itemCount'),
        silver: formattedInteger(input.payload, 'totalSilver'),
      }),
    }
  }
  return null
}
