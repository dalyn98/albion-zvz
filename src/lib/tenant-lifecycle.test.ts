import { describe, expect, it } from 'vitest'
import {
  isRecentDiscordAuthentication,
  RECENT_DISCORD_AUTH_MS,
  workspaceLifecycleReauthHref,
} from './tenant-lifecycle'

describe('tenant lifecycle sensitive-action policy', () => {
  const now = Date.UTC(2026, 6, 31, 12, 0, 0)

  it('accepts only a recent interactive Discord authentication', () => {
    expect(isRecentDiscordAuthentication(now, now)).toBe(true)
    expect(
      isRecentDiscordAuthentication(
        now - RECENT_DISCORD_AUTH_MS,
        now,
      ),
    ).toBe(true)
    expect(
      isRecentDiscordAuthentication(
        now - RECENT_DISCORD_AUTH_MS - 1,
        now,
      ),
    ).toBe(false)
    expect(isRecentDiscordAuthentication(0, now)).toBe(false)
    expect(isRecentDiscordAuthentication(undefined, now)).toBe(false)
    expect(
      isRecentDiscordAuthentication(now + 60_001, now),
    ).toBe(false)
  })

  it('returns to the exact workspace recovery screen after reauthentication', () => {
    expect(
      workspaceLifecycleReauthHref(
        '11111111-1111-4111-8111-111111111111',
      ),
    ).toBe(
      '/api/auth/discord/start?returnTo=%2Fonboard%2Fsetup%2F11111111-1111-4111-8111-111111111111&retry=1',
    )
  })
})
