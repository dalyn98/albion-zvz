import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  completeApprovalAction,
  failApprovalAction,
  initialApprovalActionState,
  requestApprovalReview,
  retryApprovalAction,
  startApprovalAction,
} from './approval-workflow'

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('approval workflow state', () => {
  it('moves a risky action through review, pending, and a visible receipt', () => {
    const reviewed = requestApprovalReview(initialApprovalActionState, 'approve', 'member-1')
    expect(reviewed).toMatchObject({ status: 'review', action: 'approve', subjectId: 'member-1' })

    const pending = startApprovalAction(reviewed)
    expect(pending).toMatchObject({ status: 'pending', action: 'approve' })

    expect(completeApprovalAction(pending, 'approved')).toEqual({
      status: 'completed',
      action: 'approve',
      subjectId: 'member-1',
      receipt: 'approved',
    })
  })

  it('keeps the failed action retryable without affecting another row', () => {
    const rowA = startApprovalAction(
      requestApprovalReview(initialApprovalActionState, 'issue-stock', 'request-a'),
    )
    const failed = failApprovalAction(rowA, 'inventory changed')

    expect(failed).toMatchObject({
      status: 'failed',
      action: 'issue-stock',
      subjectId: 'request-a',
      error: 'inventory changed',
    })
    expect(retryApprovalAction(failed)).toMatchObject({
      status: 'pending',
      action: 'issue-stock',
      subjectId: 'request-a',
    })
    expect(initialApprovalActionState).toEqual({ status: 'idle' })
  })
})

describe('approval surfaces', () => {
  it.each([
    'src/components/RegearReviewRow.tsx',
    'src/components/ExchangeReviewList.tsx',
    'src/components/EventPayoutReviewList.tsx',
    'src/components/DonationReviewList.tsx',
  ])('%s uses reviewed row actions with feedback and retry', (path) => {
    const component = source(path)
    expect(component).toContain('useApprovalWorkflow')
    expect(component).toContain('ApprovalReviewDialog')
    expect(component).toContain('ApprovalActionFeedback')
  })
})
