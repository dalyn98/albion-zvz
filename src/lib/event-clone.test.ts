import { describe, expect, it } from 'vitest'
import { buildClonedSlotRow } from './event-clone'

describe('event clone slot sanitization', () => {
  it('keeps reusable configuration and removes every member/application identity', () => {
    const cloned = buildClonedSlotRow({
      id: 'old-slot',
      guild_id: 'old-guild',
      party_id: 'old-party',
      role_name: 'Tank',
      weapon_id: 'T8_MAIN_MACE',
      conditional_options: [{ label: 'swap' }],
      assigned_discord_id: 'assigned-discord',
      assigned_username: 'assigned-name',
      assigned_weapon_id: 'assigned-weapon',
      requested_discord_id: 'requester-discord',
      requested_username: 'requester-name',
      requested_picks: [{ item: 'pick' }],
      requested_at: '2026-07-31T00:00:00Z',
    }, {
      guildId: 'new-guild',
      partyId: 'new-party',
    })

    expect(cloned).toMatchObject({
      guild_id: 'new-guild',
      party_id: 'new-party',
      role_name: 'Tank',
      weapon_id: 'T8_MAIN_MACE',
      conditional_options: [{ label: 'swap' }],
    })
    expect(Object.keys(cloned).some((key) => key.startsWith('assigned_'))).toBe(false)
    expect(Object.keys(cloned).some((key) => key.startsWith('requested_'))).toBe(false)
    expect(cloned).not.toHaveProperty('id')
  })
})
