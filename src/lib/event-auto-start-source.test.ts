import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const cron = readFileSync(
  join(process.cwd(), 'src/lib/event-auto-start.ts'),
  'utf8',
)
const imminentCron = readFileSync(
  join(process.cwd(), 'src/app/api/cron/event-imminent/route.ts'),
  'utf8',
)
const regearAction = readFileSync(
  join(process.cwd(), 'src/app/actions/regear.ts'),
  'utf8',
)
const settingsAction = readFileSync(
  join(process.cwd(), 'src/app/actions/settings.ts'),
  'utf8',
)
const onboardingAction = readFileSync(
  join(process.cwd(), 'src/app/actions/onboard.ts'),
  'utf8',
)

describe('mandatory event operational start source contract', () => {
  it('starts every newly published overdue event at gather time without a lookback', () => {
    expect(cron).toContain(".not('published_at', 'is', null)")
    expect(cron).toContain(".eq('status', 'published')")
    expect(cron).toContain(".lte('gather_at', now.toISOString())")
    expect(cron).toContain('startedAt: row.gather_at')
    expect(cron).toContain(".eq('tenants.status', 'active')")
    expect(cron).not.toContain('AUTO_START_LOOKBACK')
    expect(cron).not.toContain("getAppSetting('events_auto_start_enabled'")
  })

  it('keeps operational start independent from notification and adds a member fallback', () => {
    expect(imminentCron).not.toContain('startDuePublishedEvents')
    expect(imminentCron).not.toContain('startEventWithEffectiveRegearPolicies')
    expect(regearAction).toContain('startDuePublishedEvents({ db, guildId, eventIds: [eventId] })')
    expect(regearAction).toContain('startDuePublishedEvents({ db, guildId, eventIds })')
  })

  it('keeps the compatibility setting true and removes its general edit path', () => {
    expect(onboardingAction).toMatch(
      /key: 'events_auto_start_enabled',[\s\S]*value: 'true'/,
    )
    const editableKeys = settingsAction.slice(
      settingsAction.indexOf('const EDITABLE_KEYS'),
      settingsAction.indexOf('const MAX_VALUE_LENGTH'),
    )
    expect(editableKeys).not.toContain('events_auto_start_enabled')
  })
})
