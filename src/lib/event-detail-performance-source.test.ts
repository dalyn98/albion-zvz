import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  join(process.cwd(), 'src/app/(app-shell)/events/[id]/page.tsx'),
  'utf8',
)
const snapshotSource = readFileSync(
  join(process.cwd(), 'src/lib/event-render-snapshot.ts'),
  'utf8',
)

describe('event detail performance source', () => {
  it('loads rendered parties in one tenant-scoped cached query', () => {
    expect(snapshotSource.match(/\.from\('events'\)/g)).toHaveLength(1)
    expect(snapshotSource).toContain('state_revision')
    expect(snapshotSource).toContain('parties(')
    expect(snapshotSource).not.toContain(".from('parties')")
    expect(snapshotSource).toContain('input.guildId')
    expect(snapshotSource).toContain('input.stateRevision')
  })

  it('uses the O(1) revision RPC before loading the cached render snapshot', () => {
    expect(source).not.toMatch(/db\.rpc\('get_event_state_snapshot'/)
    expect(snapshotSource).toMatch(/db\.rpc\('get_event_state_snapshot'/)
    expect(source).toContain('loadEventRenderRevision({ guildId, eventId: id })')
    expect(source).toContain('initialFingerprint={eventStateFingerprint(event.state_revision)}')
  })

  it('resolves the access gate before loading the rendered event payload', () => {
    const accessGateIndex = source.indexOf('if (isAccessDenied)')
    const revisionLoadIndex = source.indexOf('loadEventRenderRevision({ guildId, eventId: id })')
    const eventLoadIndex = source.indexOf('loadEventRenderSnapshot({')

    expect(accessGateIndex).toBeGreaterThan(0)
    expect(revisionLoadIndex).toBeGreaterThan(accessGateIndex)
    expect(eventLoadIndex).toBeGreaterThan(accessGateIndex)
    expect(eventLoadIndex).toBeGreaterThan(revisionLoadIndex)
  })
})
