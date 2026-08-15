'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { CheckCircle2, Loader2, RotateCw, ShieldAlert, X } from 'lucide-react'
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
import { useBodyScrollLock } from './useBodyScrollLock'

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
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const isOpen = workflow.state.status === 'review' && workflow.spec !== null
  useBodyScrollLock(isOpen)

  useEffect(() => {
    if (!isOpen) return

    const trigger = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    cancelButtonRef.current?.focus({ preventScroll: true })

    return () => {
      queueMicrotask(() => {
        if (trigger?.isConnected) trigger.focus({ preventScroll: true })
      })
    }
  }, [isOpen])

  if (!isOpen || !workflow.spec || typeof document === 'undefined') return null

  const titleId = `approval-review-${workflow.spec.subjectId}`
  const summaryId = `${titleId}-summary`
  const warningId = `${titleId}-warning`

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      workflow.cancelReview()
      return
    }
    if (event.key !== 'Tab') return

    const dialog = dialogRef.current
    if (!dialog) return
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ))
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (!first || !last) {
      event.preventDefault()
      dialog.focus()
      return
    }

    const activeElement = document.activeElement
    if (
      event.shiftKey
      && (activeElement === dialog || activeElement === first || !dialog.contains(activeElement))
    ) {
      event.preventDefault()
      last.focus()
    } else if (
      !event.shiftKey
      && (activeElement === dialog || activeElement === last || !dialog.contains(activeElement))
    ) {
      event.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div
      role="presentation"
      data-approval-review-overlay
      className="fixed inset-0 z-[220] flex items-end justify-center overflow-y-auto overscroll-contain bg-black/75 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) workflow.cancelReview()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={`${summaryId} ${warningId}`}
        data-approval-review-panel
        className="my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-[20px] bg-surface shadow-[0_0_0_1px_rgb(255_255_255/0.10),0_24px_80px_rgb(0_0_0/0.55)] outline-none"
        onKeyDown={handleKeyDown}
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning-soft text-warning-soft-foreground shadow-card">
              <ShieldAlert size={20} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <h2 id={titleId} className="text-balance text-lg font-bold text-foreground">
                {workflow.spec.title}
              </h2>
              <p
                id={summaryId}
                className="mt-2 whitespace-pre-wrap break-words text-pretty text-sm leading-relaxed text-muted"
              >
                {workflow.spec.summary}
              </p>
            </div>
          </div>
          <p
            id={warningId}
            className="mt-4 rounded-xl bg-warning-soft px-3 py-2.5 text-pretty text-xs leading-relaxed text-warning-soft-foreground ring-1 ring-warning/25"
          >
            {t('reviewWarning')}
          </p>
        </div>
        <div className="grid shrink-0 grid-cols-1 gap-2 bg-surface-2 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-1px_0_rgb(255_255_255/0.06)] sm:flex sm:justify-end sm:px-6">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={workflow.cancelReview}
            className="order-2 min-h-11 rounded-lg px-4 text-sm font-semibold text-muted shadow-card ring-1 ring-border transition-[background-color,color,transform] hover:bg-surface hover:text-foreground active:scale-[0.96] sm:order-1"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={workflow.confirmReview}
            className="order-1 min-h-11 rounded-lg bg-accent px-5 text-sm font-bold text-accent-foreground shadow-card transition-[background-color,box-shadow,transform] hover:bg-accent-hover hover:shadow-lift active:scale-[0.96] sm:order-2"
          >
            {workflow.spec.confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
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
