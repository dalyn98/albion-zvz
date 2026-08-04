import { describe, expect, it } from 'vitest'
import {
  buildOfficialSupportResourceContent,
  OFFICIAL_SUPPORT_RESOURCE_KEYS,
  OFFICIAL_SUPPORT_RESOURCE_SPECS,
  type OfficialSupportResourceChannelIds,
} from '@/lib/official-support-resources'

const channelIds = Object.fromEntries(
  OFFICIAL_SUPPORT_RESOURCE_KEYS.map((key, index) => [key, String(100000000000000000n + BigInt(index))]),
) as OfficialSupportResourceChannelIds

describe('official support resources', () => {
  it('defines one unique English channel for every resource key', () => {
    expect(new Set(OFFICIAL_SUPPORT_RESOURCE_SPECS.map((entry) => entry.key)).size)
      .toBe(OFFICIAL_SUPPORT_RESOURCE_KEYS.length)
    expect(new Set(OFFICIAL_SUPPORT_RESOURCE_SPECS.map((entry) => entry.name)).size)
      .toBe(OFFICIAL_SUPPORT_RESOURCE_SPECS.length)
    expect(OFFICIAL_SUPPORT_RESOURCE_SPECS.every((entry) => /^[a-z0-9-]+$/.test(entry.name))).toBe(true)
  })

  it('keeps every Discord message safe and within the platform limit', () => {
    const content = buildOfficialSupportResourceContent(channelIds)
    expect(Object.keys(content).sort()).toEqual([...OFFICIAL_SUPPORT_RESOURCE_KEYS].sort())
    for (const message of Object.values(content)) {
      expect(message.length).toBeLessThanOrEqual(2000)
      expect(message).not.toMatch(/[가-힣]/)
      expect(message).not.toMatch(/discord(?:app)?\.com\/api\/webhooks/i)
    }
  })

  it('states the human-support and credential-safety boundaries', () => {
    const content = buildOfficialSupportResourceContent(channelIds)
    expect(content['security-and-privacy']).toMatch(/AI is staff-only and advisory/i)
    expect(content['create-a-ticket']).toMatch(/Human staff answer tickets/i)
    expect(content['before-opening-a-ticket']).toMatch(/Never share passwords/i)
    expect(content['bot-permissions']).toMatch(/does not need the Discord \*\*Administrator\*\* permission/i)
  })
})
