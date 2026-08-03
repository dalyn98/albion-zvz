import {
  isGuildFeatureDiscoverable,
  type GuildFeatureSnapshot,
} from '@/lib/guild-features'
import { DISCORD_QUICK_STARTER_DESTINATIONS } from '@/lib/discord-quick-starter-config'
import type { DiscordQuickStarterDestination } from '@/lib/discord-quick-starter-types'

export function resolveDiscordQuickStarterDestinations(
  snapshot: GuildFeatureSnapshot,
  craftedRegearSupported: boolean,
): DiscordQuickStarterDestination[] {
  return DISCORD_QUICK_STARTER_DESTINATIONS.filter((destination) => {
    if (destination === 'regear') {
      return isGuildFeatureDiscoverable(snapshot.supply.state)
    }
    if (destination === 'craft') {
      return isGuildFeatureDiscoverable(snapshot.supply.state) && craftedRegearSupported
    }
    if (destination === 'shop') {
      return isGuildFeatureDiscoverable(snapshot.guild_shop.state)
    }
    if (destination === 'wallet') {
      return isGuildFeatureDiscoverable(snapshot.guild_economy.state)
    }
    return true
  })
}
