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

  it('returns available box candidates for the assigned range', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'app', 'actions', 'craft.ts'), 'utf8')
    const start = source.indexOf('export async function computeAutoAssignBox')
    const body = source.slice(start)

    expect(start).toBeGreaterThan(-1)
    expect(body).toContain('availableBoxes')
    expect(body).toContain('availableBoxes.push(n)')
  })

  it('revalidates live Discord membership on member and crafter-specific reads and writes', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'app', 'actions', 'craft.ts'), 'utf8')
    const protectedFunctions = [
      'getMyCrafterProfile',
      'listMyCraftPickups',
      'markCraftPickupCollected',
      'setMyCrafterDefaults',
      'computeAutoAssignBox',
    ]

    for (const functionName of protectedFunctions) {
      const start = source.indexOf(`export async function ${functionName}`)
      const nextExport = source.indexOf('\nexport async function ', start + 1)
      const body = source.slice(start, nextExport === -1 ? undefined : nextExport)
      expect(start).toBeGreaterThan(-1)
      expect(body).toContain('requireLiveSession()')
    }
  })
})
