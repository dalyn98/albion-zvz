import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const onboardingSource = readFileSync(
  join(process.cwd(), 'src/app/actions/onboarding.ts'),
  'utf8',
)

describe('Discord guild nickname refresh contract', () => {
  it('syncs a manual refresh only after a verified Albion character rename', () => {
    expect(onboardingSource).toMatch(
      /refreshMyAlbionIdentity[\s\S]*result\.nicknameChanged[\s\S]*view\?\.nickname[\s\S]*syncDiscordGuildNickname/,
    )
    expect(onboardingSource).toContain("source: 'member_refresh'")
  })

  it('keeps first trusted onboarding as an explicit one-time sync source', () => {
    expect(onboardingSource).toMatch(
      /confirmAlbionIdentity[\s\S]*resourceTrusted[\s\S]*syncDiscordGuildNickname/,
    )
    expect(onboardingSource).toContain("source: 'member_onboarding'")
  })
})
