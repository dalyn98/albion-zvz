import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('member work inbox surface boundary', () => {
  it('shares the same snapshot across the inbox, member home, and shell status', () => {
    for (const path of [
      'src/app/(app-shell)/me/requests/page.tsx',
      'src/app/(app-shell)/me/page.tsx',
      'src/lib/app-shell-status.ts',
    ]) {
      expect(read(path)).toContain('loadMemberWorkInboxSnapshot')
    }
  })

  it('keeps history folded and does not duplicate the former summary and timeline lists', () => {
    const page = read('src/app/(app-shell)/me/requests/page.tsx')
    expect(page).toContain('<details')
    expect(page).toContain('actionRequired')
    expect(page).toContain('waitingOnGuild')
    expect(page).not.toContain('requestTimeline')
    expect(page).not.toContain('RequestSummaryCard')
  })

  it('deep-links to source module controls instead of defining a generic mutation', () => {
    const page = read('src/app/(app-shell)/me/requests/page.tsx')
    expect(page).toContain('ExchangeRequestActions')
    expect(page).toContain('DonationRequestCancelButton')
    expect(page).not.toMatch(/['"]use server['"]/)
    expect(read('src/components/ShopMyOrders.tsx')).toContain('shop-order-${order.id}')
    expect(read('src/components/member-trade/MemberTradeOrdersTab.tsx'))
      .toContain('member-trade-order-${order.id}')
    expect(read('src/components/MyCraftPickupsSection.tsx'))
      .toContain('craft-pickup-${p.taskId}')
    expect(read('src/components/TreasuryDepositAllocator.tsx'))
      .toContain('treasury-deposit-${deposit.id}')
  })
})
