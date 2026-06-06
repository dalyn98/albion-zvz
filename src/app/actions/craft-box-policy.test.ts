import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('craft box assignment policy', () => {
  it('does not suggest reusing an already delivered requester box', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'app', 'actions', 'craft.ts'), 'utf8')

    expect(source).not.toContain('requesterReuse')
    expect(source).not.toMatch(/regear_requests\.discord_id/)
  })
})
