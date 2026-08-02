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
    const inbox = source('src/lib/member-work-inbox.ts')
    const inboxServer = source('src/lib/member-work-inbox-server.ts')
    expect(requests).toContain('loadMemberWorkInboxSnapshot')
    expect(requests).toContain('snapshot.actionRequired')
    expect(requests).toContain('snapshot.waitingOnGuild')
    expect(requests).toContain('snapshot.history')
    expect(inbox).toContain("'shop'")
    expect(inbox).toContain("'member_trade'")
    expect(inboxServer).toContain("db.rpc('member_work_inbox_snapshot'")
  })
})
