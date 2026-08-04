import { describe, expect, it } from 'vitest'
import {
  buildOfficialSupportResourcePayloads,
  LEGACY_SUPPORT_RESOURCE_KEYS,
  OFFICIAL_SUPPORT_FEEDBACK_GUIDE,
  OFFICIAL_SUPPORT_KNOWN_ISSUES_STATUS,
  OFFICIAL_SUPPORT_RESOURCE_KEYS,
  OFFICIAL_SUPPORT_RESOURCE_SPECS,
  OFFICIAL_SUPPORT_RESOURCES_VERSION,
  type OfficialSupportResourceChannelIds,
} from '@/lib/official-support-resources'

const channelIds = Object.fromEntries(
  OFFICIAL_SUPPORT_RESOURCE_KEYS.map((key, index) => [key, String(100000000000000000n + BigInt(index))]),
) as OfficialSupportResourceChannelIds

describe('official support resources', () => {
  it('defines a compact, uniquely named premium support hub', () => {
    expect(OFFICIAL_SUPPORT_RESOURCES_VERSION).toBe('premium-support-hub-v2')
    expect(OFFICIAL_SUPPORT_RESOURCE_KEYS).toHaveLength(9)
    expect(new Set(OFFICIAL_SUPPORT_RESOURCE_SPECS.map((entry) => entry.key)).size)
      .toBe(OFFICIAL_SUPPORT_RESOURCE_KEYS.length)
    expect(new Set(OFFICIAL_SUPPORT_RESOURCE_SPECS.map((entry) => entry.name)).size)
      .toBe(OFFICIAL_SUPPORT_RESOURCE_SPECS.length)
    expect(OFFICIAL_SUPPORT_RESOURCE_SPECS.every((entry) => entry.name.includes('・'))).toBe(true)
    expect(LEGACY_SUPPORT_RESOURCE_KEYS).not.toContain('open-a-ticket')
  })

  it('keeps every managed embed safe and within Discord limits', () => {
    const payloads = buildOfficialSupportResourcePayloads(channelIds)
    expect(Object.keys(payloads).sort()).toEqual([
      'announcements',
      'before-you-open',
      'changelog',
      'open-a-ticket',
      'product-guide',
      'service-status',
      'start-here',
    ])
    for (const payload of Object.values(payloads)) {
      const description = payload.embeds?.[0]?.description ?? ''
      expect(description.length).toBeLessThanOrEqual(4096)
      expect(description).not.toMatch(/[가-힣]/)
      expect(description).not.toMatch(/discord(?:app)?\.com\/api\/webhooks/i)
      for (const row of payload.components ?? []) {
        for (const component of row.components ?? []) {
          if ('url' in component) expect(component.url).toMatch(/^https:\/\/albion-guildmanager\.com/)
        }
      }
    }
  })

  it('states human-support, least-privilege, and credential-safety boundaries', () => {
    const payloads = buildOfficialSupportResourcePayloads(channelIds)
    const startHere = payloads['start-here']?.embeds?.[0]?.description ?? ''
    const productGuide = payloads['product-guide']?.embeds?.[0]?.description ?? ''
    const ticket = payloads['open-a-ticket']?.embeds?.[0]?.description ?? ''
    expect(startHere).toMatch(/AI may privately classify or summarize/i)
    expect(startHere).toMatch(/Never share passwords/i)
    expect(productGuide).toMatch(/does \*\*not\*\* need Administrator/i)
    expect(ticket).toMatch(/Human staff answer tickets/i)
    expect(OFFICIAL_SUPPORT_FEEDBACK_GUIDE).toMatch(/reviewed by humans/i)
    expect(OFFICIAL_SUPPORT_KNOWN_ISSUES_STATUS).toMatch(/No staff-confirmed known issues/i)
  })

  it('uses forums only for confirmed issues and structured feedback', () => {
    const forumSpecs = OFFICIAL_SUPPORT_RESOURCE_SPECS.filter((entry) => entry.type === 15)
    expect(forumSpecs.map((entry) => entry.key)).toEqual(['known-issues', 'feedback'])
    expect(forumSpecs.every((entry) => (entry.forumTags?.length ?? 0) === 4)).toBe(true)
    expect(forumSpecs.find((entry) => entry.key === 'feedback')?.access).toBe('feedback')
    expect(forumSpecs.find((entry) => entry.key === 'known-issues')?.access).toBe('read-only')
  })
})
