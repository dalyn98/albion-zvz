import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  updateTag: vi.fn(),
}))

vi.mock('next/cache', () => ({
  updateTag: mocks.updateTag,
}))

import {
  markPublicGuildProfileCacheStale,
  publicGuildProfileCacheTag,
} from './guild-profile-cache'

describe('public guild profile cache', () => {
  beforeEach(() => {
    mocks.updateTag.mockReset()
  })

  it('uses a tenant-scoped tag for safe shared-data invalidation', () => {
    expect(publicGuildProfileCacheTag('guild-1')).toBe('public-guild-profile:guild-1')

    markPublicGuildProfileCacheStale('guild-1')

    expect(mocks.updateTag).toHaveBeenCalledWith('public-guild-profile:guild-1')
  })
})
