'use client'

import { useCallback, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { CheckCircle2, Loader2, RotateCw, X } from 'lucide-react'
import {
  completeApprovalAction,
  failApprovalAction,
  initialApprovalActionState,
  requestApprovalReview,
  retryApprovalAction,
  startApprovalAction,
  type ApprovalActionState,
} from '@/lib/approval-workflow'
import { emitUxWorkflowEvent } from '@/lib/ux-telemetry'

interface ApprovalResult {
  error?: string
}

export interface ApprovalActionSpec {
  action: string
  subjectId: string
  title: string
  summary: string
  confirmLabel: string
  pendingLabel: string
  receipt: string
  execute: () => Promise<ApprovalResult>
  onCompleted?: () => void
}

export interface ApprovalWorkflowController {
  state: ApprovalActionState
  spec: ApprovalActionSpec | null
  isPending: boolean
  isActionPending: (action: string) => boolean
  requestReview: (spec: ApprovalActionSpec) => void
  runAction: (spec: ApprovalActionSpec) => void
  confirmReview: () => void
  cancelReview: () => void
  retry: () => void
  dismiss: () => void
}

export function useApprovalWorkflow(): ApprovalWorkflowController {
  const [state, setState] = useState<ApprovalActionState>(initialApprovalActionState)
  const [spec, setSpec] = useState<ApprovalActionSpec | null>(null)
  const specRef = useRef<ApprovalActionSpec | null>(null)

  const execute = useCallback(async (spec: ApprovalActionSpec, retry = false) => {
    setState((current) => retry ? retryApprovalAction(current) : startApprovalAction(current))
    emitUxWorkflowEvent({
      eventType: retry ? 'task_started' : 'submitted',
      metadata: { workflow: 'approval', action: spec.action, stage: retry ? 'retry' : 'commit' },
    })
    try {
      const result = await spec.execute()
      if (result.error) {
        setState((current) => failApprovalAction(current, result.error!))
        emitUxWorkflowEvent({
          eventType: 'partial_failed',
          metadata: { workflow: 'approval', action: spec.action, result: 'server_error' },
        })
        return
      }
      setState((current) => completeApprovalAction(current, spec.receipt))
      emitUxWorkflowEvent({
        eventType: 'completed',
        metadata: { workflow: 'approval', action: spec.action, result: 'success' },
      })
      spec.onCompleted?.()
    } catch {
      setState((current) => failApprovalAction(current, 'unexpected_error'))
      emitUxWorkflowEvent({
        eventType: 'partial_failed',
        metadata: { workflow: 'approval', action: spec.action, result: 'network_error' },
      })
    }
  }, [])

  const requestReview = useCallback((spec: ApprovalActionSpec) => {
    specRef.current = spec
    setSpec(spec)
    setState((current) => requestApprovalReview(current, spec.action, spec.subjectId))
    emitUxWorkflowEvent({
      eventType: 'previewed',
      metadata: { workflow: 'approval', action: spec.action, stage: 'review' },
    })
  }, [])

  const runAction = useCallback((spec: ApprovalActionSpec) => {
    specRef.current = spec
    setSpec(spec)
    setState(requestApprovalReview(initialApprovalActionState, spec.action, spec.subjectId))
    void execute(spec)
  }, [execute])

  const confirmReview = useCallback(() => {
    if (!specRef.current || state.status !== 'review') return
    void execute(specRef.current)
  }, [execute, state.status])

  const cancelReview = useCallback(() => {
    if (state.status !== 'review') return
    specRef.current = null
    setSpec(null)
    setState(initialApprovalActionState)
  }, [state.status])

  const retry = useCallback(() => {
    if (!specRef.current || state.status !== 'failed') return
    void execute(specRef.current, true)
  }, [execute, state.status])

  const dismiss = useCallback(() => {
    specRef.current = null
    setSpec(null)
    setState(initialApprovalActionState)
  }, [])

  return {
    state,
    spec,
    isPending: state.status === 'pending',
    isActionPending: (action) => state.status === 'pending' && state.action === action,
    requestReview,
    runAction,
    confirmReview,
    cancelReview,
    retry,
    dismiss,
  }
}

export function ApprovalReviewDialog({ workflow }: { workflow: ApprovalWorkflowController }) {
  const t = useTranslations('approvalWorkflow')
  if (workflow.state.status !== 'review' || !workflow.spec) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`approval-review-${workflow.state.subjectId}`}
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/75 p-4 sm:items-center"
    >
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-amber-500/40 bg-gray-950 p-5 shadow-2xl">
        <div>
          <h2 id={`approval-review-${workflow.state.subjectId}`} className="text-lg font-bold text-white">
            {workflow.spec.title}
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
            {workflow.spec.summary}
          </p>
        </div>
        <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {t('reviewWarning')}
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={workflow.cancelReview}
            className="min-h-11 rounded-lg border border-gray-700 px-4 text-sm font-semibold text-gray-200 hover:bg-gray-800"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={workflow.confirmReview}
            className="min-h-11 rounded-lg bg-amber-500 px-5 text-sm font-bold text-black hover:bg-amber-400"
          >
            {workflow.spec.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export function ApprovalActionFeedback({ workflow }: { workflow: ApprovalWorkflowController }) {
  const t = useTranslations('approvalWorkflow')
  if (workflow.state.status === 'idle' || workflow.state.status === 'review' || !workflow.spec) {
    return null
  }

  if (workflow.state.status === 'pending') {
    return (
      <div role="status" className="flex min-h-10 items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 text-xs text-sky-200">
        <Loader2 size={14} className="animate-spin" />
        {workflow.spec.pendingLabel}
      </div>
    )
  }

  if (workflow.state.status === 'failed') {
    return (
      <div role="alert" className="flex min-h-10 flex-wrap items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
        <span className="min-w-0 flex-1 break-words">
          {workflow.state.error === 'unexpected_error'
            ? t('unexpectedError')
            : workflow.state.error}
        </span>
        <button
          type="button"
          onClick={workflow.retry}
          className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-red-400/40 px-3 font-semibold hover:bg-red-500/20"
        >
          <RotateCw size={13} /> {t('retry')}
        </button>
        <button type="button" onClick={workflow.dismiss} className="min-h-10 px-2 text-red-300" aria-label={t('dismiss')}>
          <X size={14} />
        </button>
      </div>
    )
  }

  return (
    <div role="status" className="flex min-h-10 items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs text-emerald-200">
      <CheckCircle2 size={14} />
      <span className="min-w-0 flex-1">{workflow.state.receipt}</span>
      <button type="button" onClick={workflow.dismiss} className="min-h-10 px-2 text-emerald-300" aria-label={t('dismiss')}>
        <X size={14} />
      </button>
    </div>
  )
}
