import { describe, expect, it } from 'vitest'
import { resolveDiscordQuickStarterDestinations } from '@/lib/discord-quick-starter-availability'
import {
  createFailClosedGuildFeatureSnapshot,
  type ConfigurableGuildFeatureKey,
  type GuildFeatureSnapshot,
  type GuildFeatureState,
} from '@/lib/guild-features'

function snapshotWith(
  states: Partial<Record<ConfigurableGuildFeatureKey, GuildFeatureState>>,
): GuildFeatureSnapshot {
  const snapshot = createFailClosedGuildFeatureSnapshot()
  for (const [key, state] of Object.entries(states)) {
    snapshot[key as ConfigurableGuildFeatureKey].state = state
  }
  return snapshot
}

describe('resolveDiscordQuickStarterDestinations', () => {
  it('keeps core destinations and hides disabled guild features', () => {
    expect(resolveDiscordQuickStarterDestinations(snapshotWith({}), false)).toEqual([
      'verify',
      'events',
      'me',
      'guide',
    ])
  })

  it('shows only discoverable feature destinations and requires crafted regear support', () => {
    const snapshot = snapshotWith({
      supply: 'draining',
      guild_economy: 'enabled',
      guild_shop: 'enabled',
    })

    expect(resolveDiscordQuickStarterDestinations(snapshot, false)).toEqual([
      'verify',
      'events',
      'me',
      'guide',
      'regear',
      'shop',
      'wallet',
    ])
    expect(resolveDiscordQuickStarterDestinations(snapshot, true)).toContain('craft')
  })
})
