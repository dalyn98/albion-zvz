import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  join(process.cwd(), 'src/app/(app-shell)/events/[id]/page.tsx'),
  'utf8',
)

describe('event detail performance source', () => {
  it('loads the event revision and rendered parties in one consistent query', () => {
    const getEventSource = source.slice(
      source.indexOf('async function getEvent'),
      source.indexOf('export default async function EventDetailPage'),
    )

    expect(getEventSource.match(/\.from\('events'\)/g)).toHaveLength(1)
    expect(getEventSource).toContain('state_revision')
    expect(getEventSource).toContain('parties(')
    expect(getEventSource).not.toContain(".from('parties')")
  })

  it('does not issue a separate snapshot RPC during the initial render', () => {
    expect(source).not.toMatch(/db\.rpc\('get_event_state_snapshot'/)
    expect(source).toContain('initialFingerprint={eventStateFingerprint(event.state_revision)}')
  })

  it('resolves the access gate before loading the rendered event payload', () => {
    const accessGateIndex = source.indexOf('if (isAccessDenied)')
    const eventLoadIndex = source.indexOf('getEvent(id, guildId)')

    expect(accessGateIndex).toBeGreaterThan(0)
    expect(eventLoadIndex).toBeGreaterThan(accessGateIndex)
  })
})
