import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { APPROVE_ALL_PENDING_LIMIT } from './approval-bulk'

const componentSource = readFileSync(
  'src/components/ApproveAllPendingButton.tsx',
  'utf8',
)
const actionSource = readFileSync('src/app/actions/approval-bulk.ts', 'utf8')

describe('bulk approval safety contract', () => {
  it('shares one bounded batch limit between the UI warning and server action', () => {
    expect(APPROVE_ALL_PENDING_LIMIT).toBe(200)
    expect(componentSource).toContain('APPROVE_ALL_PENDING_LIMIT')
    expect(actionSource).toContain('APPROVE_ALL_PENDING_LIMIT')
    expect(actionSource).not.toMatch(/const APPROVE_ALL_PENDING_LIMIT\s*=/)
  })

  it('requires an explicit confirmation before starting financial mutations', () => {
    const confirmation = componentSource.indexOf('await askConfirm({')
    const transition = componentSource.indexOf('startTransition(async () =>')

    expect(confirmation).toBeGreaterThan(0)
    expect(transition).toBeGreaterThan(confirmation)
    expect(componentSource).toContain("destructive: true")
  })
})
