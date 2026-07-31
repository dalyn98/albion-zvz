import { createHash } from 'node:crypto'

export interface DiscordDeliveryIdentity {
  guildId: string
  topic: string
  sourceTable: string
  sourceId: string
  deliveryKind?: string
}

// Discord's enforce_nonce option deduplicates recent Create Message retries.
// Keep the value below the unsigned 64-bit range and stable for one logical
// tenant/source/recipient-kind delivery.
export function discordDeliveryNonce(input: DiscordDeliveryIdentity): string {
  const digest = createHash('sha256')
    .update([
      input.guildId,
      input.topic,
      input.sourceTable,
      input.sourceId,
      input.deliveryKind ?? 'channel',
    ].join('\u0000'))
    .digest('hex')
    .slice(0, 15)
  return BigInt(`0x${digest}`).toString(10)
}
