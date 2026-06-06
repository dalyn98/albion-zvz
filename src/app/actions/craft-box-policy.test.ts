import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('craft box assignment policy', () => {
  it('does not suggest reusing an already delivered requester box', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'app', 'actions', 'craft.ts'), 'utf8')
    const start = source.indexOf('export async function computeAutoAssignBox')
    const body = source.slice(start)

    expect(start).toBeGreaterThan(-1)
    expect(body).not.toContain('requesterReuse')
    expect(body).not.toMatch(/regear_requests\.discord_id/)
  })
})
