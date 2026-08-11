'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCheck, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { approveAllPendingRequests } from '@/app/actions/approval-bulk'
import { useToast } from './ToastProvider'

export default function ApproveAllPendingButton({ count }: { count: number }) {
  const t = useTranslations('adminApprovals')
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  const approveAll = () => {
    startTransition(async () => {
      const result = await approveAllPendingRequests()
      if (result.fatalError) {
        toast.error(result.fatalError)
        return
      }

      const hasQueueError = result.queues.some((queue) => Boolean(queue.error))
      if (result.succeeded > 0 && result.failed === 0 && result.skipped === 0 && !hasQueueError) {
        toast.success(t('approveAllDone', { count: result.succeeded }))
      } else if (result.succeeded > 0 || result.skipped > 0) {
        toast.info(
          `${t('approveAllPartial', {
            success: result.succeeded,
            failed: result.failed,
            skipped: result.skipped,
          })}\n${t('approveAllRetryHint')}`,
          6000,
        )
      } else if (result.failed > 0 || hasQueueError) {
        toast.error(
          result.queues.find((queue) => queue.error)?.error ?? t('approveAllFailed'),
        )
      } else {
        toast.info(t('approveAllNoEligible'))
      }
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={approveAll}
      disabled={pending || count === 0}
      title={t('approveAllHint')}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-success px-4 text-sm font-semibold text-success-foreground shadow-card transition-[background-color,box-shadow,transform,opacity] duration-200 hover:shadow-lift active:not-disabled:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-45"
    >
      {pending ? (
        <Loader2 size={16} className="animate-spin" aria-hidden="true" />
      ) : (
        <CheckCheck size={16} aria-hidden="true" />
      )}
      <span className="tabular-nums">
        {pending ? t('approvingAll') : t('approveAll', { count })}
      </span>
    </button>
  )
}
