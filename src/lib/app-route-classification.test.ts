import { describe, expect, it } from 'vitest'
import { isPublicEventDetailPathname, isPublicPathname } from './app-route-classification'

describe('app route classification', () => {
  it('treats shareable event detail links as public', () => {
    expect(isPublicEventDetailPathname('/events/event-1')).toBe(true)
    expect(isPublicEventDetailPathname('/events/event-1/')).toBe(true)
    expect(isPublicPathname('/events/event-1')).toBe(true)
  })

  it('keeps event list and nested operational pages behind their existing guards', () => {
    expect(isPublicPathname('/events')).toBe(false)
    expect(isPublicPathname('/events/event-1/report')).toBe(false)
    expect(isPublicPathname('/events/event-1/party/1')).toBe(false)
    expect(isPublicPathname('/admin/dashboard/events/event-1')).toBe(false)
  })

  it('preserves existing public route behavior', () => {
    expect(isPublicPathname('/public/landing')).toBe(true)
    expect(isPublicPathname('/demo/events/evt-1')).toBe(true)
    expect(isPublicPathname('/guild-login')).toBe(true)
  })
})
