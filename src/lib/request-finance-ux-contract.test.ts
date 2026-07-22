import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('request and finance UX', () => {
  it('reviews recipients, amounts, and remaining balance before point transfer', () => {
    const transfer = source('src/components/TransferPointsForm.tsx')
    expect(transfer).toContain('reviewOpen')
    expect(transfer).toContain('commitTransfer')
    expect(transfer).toContain('transferReviewTitle')
    expect(transfer).toContain('transferReviewRecipientCount')
    expect(transfer).toMatch(/setReviewOpen\(true\)[\s\S]*commitTransfer[\s\S]*transferPoints/)
  })

  it('unifies shop and member-trade progress with existing member requests', () => {
    const requests = source('src/app/(app-shell)/me/requests/page.tsx')
    expect(requests).toContain('listMyShopOrders')
    expect(requests).toContain('listMyMemberTradeOrders')
    expect(requests).toContain('shopOrders')
    expect(requests).toContain('memberTradeOrders')
    expect(requests).toContain('requestTimeline')
  })
})
