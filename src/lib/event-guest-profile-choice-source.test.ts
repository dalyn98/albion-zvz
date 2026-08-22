import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  join(process.cwd(), 'src/components/EventGuestProfileGate.tsx'),
  'utf8',
)

describe('event guest profile entry choice', () => {
  it('explains Discord and anonymous entry before collecting character details', () => {
    const discordChoice = source.indexOf("t('discordDescription')")
    const anonymousChoice = source.indexOf("t('anonymousDescription')")
    const characterInput = source.indexOf('name="characterName"')

    expect(discordChoice).toBeGreaterThan(-1)
    expect(anonymousChoice).toBeGreaterThan(discordChoice)
    expect(characterInput).toBeGreaterThan(anonymousChoice)
    expect(source).toContain("t('discordRecommended')")
  })

  it('keeps the modal and validation feedback accessible', () => {
    expect(source).toContain('aria-describedby="event-guest-profile-description"')
    expect(source).toContain('id="event-guest-profile-description"')
    expect(source).toContain('role="alert"')
    expect(source).toContain('aria-live="polite"')
    expect(source).not.toContain('autoFocus')
  })

  it('uses full-size touch targets for both entry paths', () => {
    expect(source.match(/min-h-11/g)?.length ?? 0).toBeGreaterThanOrEqual(5)
    expect(source).toContain('active:scale-[0.96]')
  })
})
