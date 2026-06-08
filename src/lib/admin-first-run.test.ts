import { describe, expect, it } from 'vitest'
import {
  buildFirstRunTestAnnouncementPayload,
  consumeFirstRunAnnouncementRateLimit,
} from './admin-first-run'

const LABELS = {
  content: 'Setup test for Example Guild',
  title: 'Example Guild setup check',
  description: 'If this message appears, Discord channel posting is ready.',
  inviteField: 'Member invite',
  eventsField: 'Events',
  guideField: 'Operator guide',
  footer: 'No roles or everyone mentions are used for this test.',
}

describe('admin first-run Discord test announcement', () => {
  it('builds a quiet Discord payload with no mention permissions', () => {
    const payload = buildFirstRunTestAnnouncementPayload({
      guildName: 'Example Guild',
      inviteUrl: 'https://example.guild/onboarding/albion',
      eventsUrl: 'https://example.guild/events',
      guideUrl: 'https://example.guild/admin/dashboard/guide',
      labels: LABELS,
    })

    expect(payload.allowed_mentions).toEqual({ parse: [] })
    expect(JSON.stringify(payload)).not.toContain('@everyone')
    expect(JSON.stringify(payload)).not.toContain('<@&')
    expect(payload.content).toBe('Setup test for Example Guild')
    expect(payload.embeds?.[0]?.fields).toEqual([
      {
        name: 'Member invite',
        value: 'https://example.guild/onboarding/albion',
        inline: false,
      },
      {
        name: 'Events',
        value: 'https://example.guild/events',
        inline: true,
      },
      {
        name: 'Operator guide',
        value: 'https://example.guild/admin/dashboard/guide',
        inline: true,
      },
    ])
  })

  it('rate-limits repeated test announcements per admin and tenant key', () => {
    const store = new Map<string, number>()
    const first = consumeFirstRunAnnouncementRateLimit(store, {
      key: 'tenant-1:admin-1',
      nowMs: 1_000,
      windowMs: 30_000,
    })
    const repeated = consumeFirstRunAnnouncementRateLimit(store, {
      key: 'tenant-1:admin-1',
      nowMs: 15_000,
      windowMs: 30_000,
    })
    const afterWindow = consumeFirstRunAnnouncementRateLimit(store, {
      key: 'tenant-1:admin-1',
      nowMs: 31_001,
      windowMs: 30_000,
    })

    expect(first.allowed).toBe(true)
    expect(repeated).toEqual({ allowed: false, retryAfterSeconds: 16 })
    expect(afterWindow.allowed).toBe(true)
  })
})
