import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('inventory and member market UX', () => {
  it('tracks inventory mutations by item and exposes retry feedback', () => {
    const inventory = source('src/components/AdminInventoryGearPanel.tsx')
    expect(inventory).toContain('useApprovalWorkflow')
    expect(inventory).toContain('inventoryWorkflow.state.subjectId')
    expect(inventory).toContain('ApprovalActionFeedback')
    expect(inventory).toContain('ApprovalReviewDialog')
  })

  it('commits only the reviewed member-trade purchase or offer snapshot', () => {
    const market = source('src/components/MemberTradeMarket.tsx')
    expect(market).toContain('tradeReview')
    expect(market).toContain('commitTradeReview')
    expect(market).toContain('tradeReviewTitle')
    expect(market).toMatch(/setTradeReview\([\s\S]*commitTradeReview[\s\S]*buyMemberTradeListing/)
    expect(market).toContain('confirmTradeStatusChange')
  })
})
