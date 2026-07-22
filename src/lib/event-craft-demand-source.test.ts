import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('event craft demand workflow', () => {
  it('loads active craft tasks through a doubly tenant-scoped event join', () => {
    const loader = source('src/lib/event-operations-server.ts')
    expect(loader).toContain(".from('craft_tasks')")
    expect(loader).toContain(".eq('guild_id', guildId)")
    expect(loader).toContain(".eq('regear_requests.guild_id', guildId)")
    expect(loader).toContain(".eq('regear_requests.event_id', eventId)")
    expect(loader).toContain(".in('status', ['queued', 'claimed', 'delivered'])")
    expect(loader).toContain(".from('guild_inventory_gear')")
  })

  it('makes the report link open an actually event-filtered craft queue', () => {
    const report = source('src/app/(app-shell)/events/[id]/report/page.tsx')
    const queuePage = source('src/app/(app-shell)/craft/queue/page.tsx')
    const queueAction = source('src/app/actions/craft-queue.ts')
    expect(report).toContain('`/craft/queue?event=${event.id}`')
    expect(queuePage).toContain('searchParams')
    expect(queuePage).toContain('UUID_RE.test(normalizedEventId)')
    expect(queuePage).toContain('listCraftQueueForCrafter(eventId)')
    expect(queueAction).toContain(".eq('regear_requests.event_id', eventId)")
  })
})
