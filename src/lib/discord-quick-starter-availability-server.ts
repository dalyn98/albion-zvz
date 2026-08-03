import 'server-only'

import { resolveDiscordQuickStarterDestinations } from '@/lib/discord-quick-starter-availability'
import { loadGuildFeatureSnapshot } from '@/lib/guild-features-server'
import { isCraftedRegearSupported } from '@/lib/regear-support-server'

export async function loadDiscordQuickStarterDestinations(guildId: string) {
  const [snapshot, craftedRegearSupported] = await Promise.all([
    loadGuildFeatureSnapshot(guildId),
    isCraftedRegearSupported(guildId),
  ])

  return resolveDiscordQuickStarterDestinations(snapshot, craftedRegearSupported)
}
