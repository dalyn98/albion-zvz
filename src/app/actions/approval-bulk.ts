'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import {
  approveRegearRequest,
  listRegearRequests,
} from '@/app/actions/regear-admin'
import {
  approveExchangeRequest,
  listExchangeRequests,
} from '@/app/actions/exchange-admin'
import {
  approveDonationRequest,
  listDonationRequests,
} from '@/app/actions/donation-admin'
import {
  approveEventPayoutRequest,
  listEventPayoutRequests,
} from '@/app/actions/event-payout-admin'
import {
  approveCraftOrderTaskAdmin,
  listCraftOrderTasksForReview,
} from '@/app/actions/craft-orders'
import {
  approveShopOrder,
  listShopOrders,
} from '@/app/actions/shop-admin'
import { CAP } from '@/lib/permissions'
import { getSession, sessionHasAny } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { canApproveRegearParticipantStatus } from '@/lib/regear-participant-confirmation'
import { isRegearSupported } from '@/lib/regear-support-server'
import { hasBlockingShopOrderStockShortage } from '@/lib/shop/order-approval'
import { publicActionError } from '@/lib/public-action-error'
import { APPROVE_ALL_PENDING_LIMIT } from '@/lib/approval-bulk'

export type BulkApprovalQueueKey =
  | 'donation'
  | 'event_payout'
  | 'craft'
  | 'regear'
  | 'exchange'
  | 'shop'

export interface BulkApprovalQueueResult {
  key: BulkApprovalQueueKey
  total: number
  succeeded: number
  failed: number
  skipped: number
  error?: string
}

export interface ApproveAllPendingResult {
  total: number
  succeeded: number
  failed: number
  skipped: number
  queues: BulkApprovalQueueResult[]
  fatalError?: string
}

type ApprovalResult = { error?: string }

const QUEUE_CAPABILITIES = {
  donation: [CAP.DONATION_APPROVE],
  event_payout: [CAP.EVENT_MANAGE],
  craft: [CAP.CRAFT_TASK_DELIVER, CAP.CRAFT_MASTER],
  regear: [CAP.REGEAR_APPROVE, CAP.REGEAR_EDIT_PRICE, CAP.REGEAR_BULK_ACTION],
  exchange: [CAP.EXCHANGE_APPROVE],
  shop: [CAP.INVENTORY_DELIVER],
} as const satisfies Record<BulkApprovalQueueKey, readonly bigint[]>

function emptyResult(): ApproveAllPendingResult {
  return { total: 0, succeeded: 0, failed: 0, skipped: 0, queues: [] }
}

async function approveQueue(
  key: BulkApprovalQueueKey,
  ids: readonly string[],
  skippedForSafety: number,
  remainingBudget: number,
  approve: (id: string) => Promise<ApprovalResult>,
): Promise<BulkApprovalQueueResult> {
  const selected = ids.slice(0, remainingBudget)
  const skippedForLimit = Math.max(0, ids.length - selected.length)
  const result: BulkApprovalQueueResult = {
    key,
    total: ids.length + skippedForSafety,
    succeeded: 0,
    failed: 0,
    skipped: skippedForSafety + skippedForLimit,
  }

  for (const id of selected) {
    const approval = await approve(id)
    if (approval.error) {
      result.failed += 1
      result.error ??= approval.error
    } else {
      result.succeeded += 1
    }
  }
  return result
}

function addQueueResult(
  aggregate: ApproveAllPendingResult,
  queue: BulkApprovalQueueResult,
): void {
  aggregate.queues.push(queue)
  aggregate.total += queue.total
  aggregate.succeeded += queue.succeeded
  aggregate.failed += queue.failed
  aggregate.skipped += queue.skipped
}

/**
 * Approves every currently safe request the caller is allowed to resolve.
 * Credit-producing queues run first so a same-member withdrawal or purchase
 * can use a top-up approved by the same click. Every child action still owns
 * authentication, tenant scoping, validation, audit logging, and notification.
 */
export async function approveAllPendingRequests(): Promise<ApproveAllPendingResult> {
  const result = emptyResult()
  const tErr = await getTranslations('adminActionError')

  try {
    const session = await getSession()
    if (!session) return { ...result, fatalError: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)

    let remainingBudget = APPROVE_ALL_PENDING_LIMIT
    const canRun = (key: BulkApprovalQueueKey) =>
      sessionHasAny(session, QUEUE_CAPABILITIES[key])
    const record = (queue: BulkApprovalQueueResult) => {
      addQueueResult(result, queue)
      remainingBudget = Math.max(0, remainingBudget - queue.succeeded - queue.failed)
    }

    // Credits first: they may make later exchange/shop debits eligible.
    if (canRun('donation')) {
      const listed = await listDonationRequests('pending')
      if (listed.error) {
        record({ key: 'donation', total: 0, succeeded: 0, failed: 0, skipped: 0, error: listed.error })
      } else {
        record(await approveQueue(
          'donation',
          listed.requests.map((row) => row.id),
          0,
          remainingBudget,
          approveDonationRequest,
        ))
      }
    }

    if (canRun('event_payout')) {
      const listed = await listEventPayoutRequests('pending')
      if (listed.error) {
        record({ key: 'event_payout', total: 0, succeeded: 0, failed: 0, skipped: 0, error: listed.error })
      } else {
        record(await approveQueue(
          'event_payout',
          listed.requests.map((row) => row.id),
          0,
          remainingBudget,
          approveEventPayoutRequest,
        ))
      }
    }

    if (canRun('craft')) {
      const listed = await listCraftOrderTasksForReview('pending')
      if (listed.error) {
        record({ key: 'craft', total: 0, succeeded: 0, failed: 0, skipped: 0, error: listed.error })
      } else {
        record(await approveQueue(
          'craft',
          listed.tasks.map((row) => row.taskId),
          0,
          remainingBudget,
          approveCraftOrderTaskAdmin,
        ))
      }
    }

    if (canRun('regear')) {
      const listed = await listRegearRequests('pending', 'all', 'all')
      if (listed.error) {
        record({ key: 'regear', total: 0, succeeded: 0, failed: 0, skipped: 0, error: listed.error })
      } else {
        const supported = await isRegearSupported(guildId)
        const safe = supported
          ? listed.requests.filter((row) =>
              canApproveRegearParticipantStatus(row.participant_confirmation_status),
            )
          : []
        record(await approveQueue(
          'regear',
          safe.map((row) => row.id),
          listed.requests.length - safe.length,
          remainingBudget,
          approveRegearRequest,
        ))
      }
    }

    if (canRun('exchange')) {
      const listed = await listExchangeRequests('pending')
      if (listed.error) {
        record({ key: 'exchange', total: 0, succeeded: 0, failed: 0, skipped: 0, error: listed.error })
      } else {
        // Re-read balances after credit queues. The action/RPC validates again.
        const safe = listed.requests.filter((row) => row.balance >= row.silver)
        record(await approveQueue(
          'exchange',
          safe.map((row) => row.id),
          listed.requests.length - safe.length,
          remainingBudget,
          approveExchangeRequest,
        ))
      }
    }

    if (canRun('shop')) {
      const listed = await listShopOrders('pending')
      if (listed.error) {
        record({ key: 'shop', total: 0, succeeded: 0, failed: 0, skipped: 0, error: listed.error })
      } else {
        const safe = listed.orders.filter((order) =>
          order.balance >= order.totalPoints &&
          !hasBlockingShopOrderStockShortage({
            stockReservedAt: order.stockReservedAt,
            items: order.items,
          }),
        )
        record(await approveQueue(
          'shop',
          safe.map((order) => order.id),
          listed.orders.length - safe.length,
          remainingBudget,
          approveShopOrder,
        ))
      }
    }

    revalidatePath('/admin/dashboard/approvals')
    revalidatePath('/admin/dashboard')
    revalidatePath('/me')
    revalidatePath('/', 'layout')
    return result
  } catch (error) {
    return {
      ...result,
      fatalError: await publicActionError(error, 'actions/approval-bulk'),
    }
  }
}
