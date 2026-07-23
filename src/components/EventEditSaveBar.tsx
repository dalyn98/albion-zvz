'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { CalendarOff, Save, Send } from 'lucide-react'
import { getEventPublishSummary, publishEvent } from '@/app/actions/admin'
import { reviewEventMemberAbsences } from '@/app/actions/member-operations'
import { useEventEditSaveAll } from './EventEditSaveRegistry'
import { useToast } from '@/components/ToastProvider'
import { emitUxWorkflowEvent } from '@/lib/ux-telemetry'
import type { EventPublishSummary } from '@/lib/event-publish-summary'
import type { EventMemberAbsenceConflict } from '@/lib/member-operations'
import { useBodyScrollLock } from './useBodyScrollLock'

interface Props {
  // published 이벤트 저장 성공 시 상세 페이지로 이동할 때 사용. draft 는
  // 편집 화면에 남아 있어야 게시 전 추가 수정이 가능하다.
  eventId: string
  eventStatus: 'draft' | 'published'
  showPublishAction?: boolean
  publishSummary?: EventPublishSummary
}

// 이벤트 편집 화면 하단 고정 저장 바. 등록된 섹션 전체를 순차 저장하고
// 에러를 모아 표시. 섹션별 save 버튼을 숨기고 이 바로만 커밋하게 한다.
export default function EventEditSaveBar({
  eventId,
  eventStatus,
  showPublishAction = false,
  publishSummary,
}: Props) {
  const ctx = useEventEditSaveAll()
  const t = useTranslations('adminEditEvent')
  const tCommon = useTranslations('common')
  const tPublish = useTranslations('publishEventBanner')
  const tMemberOperations = useTranslations('memberOperations')
  const router = useRouter()
  const toast = useToast()
  const [activeAction, setActiveAction] = useState<'save' | 'publish' | null>(null)
  const [errors, setErrors] = useState<Array<{ id: string; label: string; error: string }>>([])
  const [justSaved, setJustSaved] = useState(false)
  const [publishReviewOpen, setPublishReviewOpen] = useState(false)
  useBodyScrollLock(publishReviewOpen)
  const [reviewedPublishSummary, setReviewedPublishSummary] =
    useState<EventPublishSummary | null>(null)
  const [absenceConflicts, setAbsenceConflicts] = useState<EventMemberAbsenceConflict[]>([])
  const [pendingAfterAbsenceReview, setPendingAfterAbsenceReview] =
    useState<'save' | 'publish' | null>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const isBusy = activeAction !== null
  const activePublishSummary = reviewedPublishSummary ?? publishSummary

  const focusSection = (id: string) => {
    const section = document.getElementById(`event-save-${id}`)
    if (!section) return
    section.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const target = section.querySelector<HTMLElement>('input, select, textarea, button')
    target?.focus({ preventScroll: true })
  }

  const finishSave = () => {
    setJustSaved(true)
    emitUxWorkflowEvent({
      eventType: 'completed',
      metadata: { workflow: 'event_edit', result: 'success' },
    })
    if (eventStatus === 'published') {
      router.push(`/events/${eventId}`)
    } else {
      router.refresh()
    }
  }

  const openPublishReview = async () => {
    const summaryResult = await getEventPublishSummary(eventId)
    if (!summaryResult.summary || summaryResult.error) {
      setErrors([{
        id: 'publish',
        label: tPublish('publishButton'),
        error: summaryResult.error ?? tCommon('unknown'),
      }])
      setActiveAction(null)
      return
    }
    setReviewedPublishSummary(summaryResult.summary)
    setActiveAction(null)
    setPublishReviewOpen(true)
    emitUxWorkflowEvent({ eventType: 'previewed', metadata: { workflow: 'event_publish', stage: 'review' } })
  }

  const reviewPersistedAbsences = async (
    nextAction: 'save' | 'publish',
  ): Promise<boolean> => {
    const result = await reviewEventMemberAbsences(eventId)
    if (result.error) {
      setErrors([{
        id: 'event-info',
        label: tMemberOperations('adminAbsenceTitle'),
        error: result.error,
      }])
      return false
    }
    if (result.conflicts.length === 0) {
      setAbsenceConflicts([])
      setPendingAfterAbsenceReview(null)
      return true
    }
    setAbsenceConflicts(result.conflicts)
    setPendingAfterAbsenceReview(nextAction)
    return false
  }

  const handleClick = async () => {
    if (!ctx || isBusy) return
    emitUxWorkflowEvent({
      eventType: 'submitted',
      metadata: { workflow: 'event_edit', stage: 'commit' },
    })
    setActiveAction('save')
    setErrors([])
    setJustSaved(false)
    setAbsenceConflicts([])
    setPendingAfterAbsenceReview(null)
    const errs = await ctx.triggerSaveAll()
    setErrors(errs)
    if (errs.length > 0) {
      setActiveAction(null)
      emitUxWorkflowEvent({
        eventType: 'partial_failed',
        metadata: { workflow: 'event_edit', reason: 'section_save_failed' },
      })
      return
    }
    if (!(await reviewPersistedAbsences('save'))) {
      setActiveAction(null)
      return
    }
    setActiveAction(null)
    finishSave()
  }

  const handlePublish = async () => {
    if (!ctx || isBusy) return
    setActiveAction('publish')
    setErrors([])
    setJustSaved(false)
    setReviewedPublishSummary(null)
    setAbsenceConflicts([])
    setPendingAfterAbsenceReview(null)
    const errs = await ctx.triggerSaveAll()
    if (errs.length > 0) {
      setErrors(errs)
      setActiveAction(null)
      return
    }
    if (!(await reviewPersistedAbsences('publish'))) {
      setActiveAction(null)
      return
    }
    await openPublishReview()
  }

  const continueAfterAbsenceReview = async () => {
    const nextAction = pendingAfterAbsenceReview
    if (!nextAction || isBusy) return
    setAbsenceConflicts([])
    setPendingAfterAbsenceReview(null)
    if (nextAction === 'save') {
      finishSave()
      return
    }
    setActiveAction('publish')
    await openPublishReview()
  }

  const confirmPublish = async () => {
    if (isBusy) return
    setActiveAction('publish')
    emitUxWorkflowEvent({ eventType: 'submitted', metadata: { workflow: 'event_publish', stage: 'commit' } })
    const result = await publishEvent(eventId)
    if (result.error) {
      setErrors([{ id: 'publish', label: tPublish('publishButton'), error: result.error }])
      setActiveAction(null)
      setPublishReviewOpen(false)
      emitUxWorkflowEvent({ eventType: 'validation_failed', metadata: { workflow: 'event_publish', reason: 'server_rejected' } })
      return
    }
    if (result.warning) {
      toast.error(tPublish('publishedNotifyFailed', { error: result.warning }))
    }
    emitUxWorkflowEvent({ eventType: 'completed', metadata: { workflow: 'event_publish', result: 'success' } })
    router.push('/admin/dashboard/events')
  }

  // 성공 플래시를 타이머 기반으로 한 번만 띄우되, 언마운트/재저장 시 이전
  // 타이머는 정리해야 state leak/경쟁을 피할 수 있다.
  useEffect(() => {
    if (!justSaved) return
    const h = setTimeout(() => setJustSaved(false), 2000)
    return () => clearTimeout(h)
  }, [justSaved])

  useEffect(() => {
    const bar = barRef.current
    if (!bar) return
    const updateHeight = () => {
      document.documentElement.style.setProperty(
        '--event-save-bar-height',
        `${Math.ceil(bar.getBoundingClientRect().height)}px`,
      )
    }
    updateHeight()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateHeight)
    observer?.observe(bar)
    return () => {
      observer?.disconnect()
      document.documentElement.style.removeProperty('--event-save-bar-height')
    }
  }, [])

  return (
    <div
      ref={barRef}
      className="sticky bottom-0 left-0 right-0 z-30 -mx-4 mt-6 border-t border-gray-800 bg-gray-950/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:mx-0"
      data-event-edit-save-bar
    >
      {absenceConflicts.length > 0 && (
        <div className="mb-2 rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-3 text-xs text-violet-100" role="alert">
          <div className="flex items-start gap-2">
            <CalendarOff size={15} className="mt-0.5 shrink-0 text-violet-300" />
            <div className="min-w-0 flex-1">
              <p className="font-bold">{tMemberOperations('saveReviewTitle')}</p>
              <p className="mt-1 leading-relaxed text-gray-300">
                {tMemberOperations('saveReviewDescription')}
              </p>
              <ul className="mt-2 space-y-1">
                {absenceConflicts.map((conflict) => (
                  <li key={conflict.id}>
                    {tMemberOperations('adminAbsenceItem', {
                      name: conflict.displayName,
                      from: conflict.startsOn,
                      to: conflict.endsOn,
                    })}
                    {conflict.reason ? ` · ${conflict.reason}` : ''}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={continueAfterAbsenceReview}
                disabled={isBusy || ctx?.hasUnsavedChanges}
                className="mt-3 min-h-9 rounded-lg border border-violet-400/40 bg-violet-500/15 px-3 font-bold text-violet-100 hover:bg-violet-500/25 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {tMemberOperations(
                  pendingAfterAbsenceReview === 'publish'
                    ? 'saveReviewContinuePublish'
                    : 'saveReviewContinueSave',
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {errors.length > 0 && (
        <ul className="mb-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-300 text-xs space-y-0.5 max-h-28 overflow-y-auto">
          {errors.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => focusSection(e.id)}
                className="text-left underline decoration-dotted underline-offset-2"
              >
                <span className="font-semibold">{e.label}:</span> {e.error}
              </button>
            </li>
          ))}
        </ul>
      )}
      {ctx && ctx.sectionReceipts.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5 text-[11px]">
          {ctx.sectionReceipts.map((receipt) => (
            <button
              key={receipt.id}
              type="button"
              onClick={() => focusSection(receipt.id)}
              className={`rounded-full border px-2 py-1 ${
                receipt.status === 'saved'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                  : receipt.status === 'failed'
                    ? 'border-red-500/40 bg-red-500/10 text-red-200'
                    : 'border-gray-700 bg-gray-800 text-gray-400'
              }`}
            >
              {receipt.label} · {t(`sectionStatus_${receipt.status}`)}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-3">
        {ctx?.hasUnsavedChanges && !isBusy && !justSaved && (
          <span className="text-amber-300 text-xs text-pretty">
            {ctx.dirtySectionLabels.length > 0
              ? t('unsavedSectionSummary', {
                count: ctx.dirtySectionLabels.length,
                sections: ctx.dirtySectionLabels.join(' · '),
              })
              : t('unsavedChanges')}
          </span>
        )}
        {justSaved && (
          <span className="text-green-400 text-xs">{t('saveAllSuccess')}</span>
        )}
        <button
          type="button"
          onClick={() => handleClick()}
          disabled={isBusy || !ctx}
          className={`inline-flex w-full sm:w-auto items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed font-bold px-6 py-2.5 rounded-lg transition-colors ${
            showPublishAction
              ? 'bg-gray-800 hover:bg-gray-700 text-gray-100 border border-gray-700'
              : 'bg-amber-500 hover:bg-amber-400 text-black'
          }`}
        >
          <Save size={15} />
          {activeAction === 'save' ? tCommon('saving') : t('saveAll')}
        </button>
        {showPublishAction && (
          <button
            type="button"
            onClick={() => handlePublish()}
            disabled={isBusy || !ctx}
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold px-6 py-2.5 rounded-lg transition-colors"
          >
            <Send size={15} />
            {activeAction === 'publish' ? tPublish('publishing') : tPublish('publishButton')}
          </button>
        )}
      </div>
      {publishReviewOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-contain bg-black/70 px-4 py-[max(1rem,env(safe-area-inset-bottom))]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="event-publish-review-title"
          data-event-publish-review-overlay
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPublishReviewOpen(false)
          }}
        >
          <div
            className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-lg space-y-4 overflow-y-auto overscroll-contain rounded-2xl border border-gray-700 bg-gray-950 p-5 shadow-2xl"
            data-event-publish-review-panel
          >
            <div>
              <h2 id="event-publish-review-title" className="text-lg font-bold text-white">
                {tPublish('reviewTitle')}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-gray-400">
                {tPublish('reviewDescription')}
              </p>
            </div>
            {activePublishSummary && (
              <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                <ReviewItem label={tPublish('visibleSlots')} value={activePublishSummary.visibleSlots} />
                <ReviewItem label={tPublish('assignedSlots')} value={activePublishSummary.assignedSlots} />
                <ReviewItem label={tPublish('emptySlots')} value={activePublishSummary.emptySlots} />
                <ReviewItem label={tPublish('hiddenSlots')} value={activePublishSummary.hiddenSlots} />
                <ReviewItem label={tPublish('tentativeCount')} value={activePublishSummary.tentativeCount} />
                <ReviewItem
                  label={tPublish('notificationChannel')}
                  value={activePublishSummary.hasNotificationChannel ? tPublish('ready') : tPublish('notSet')}
                  warn={!activePublishSummary.hasNotificationChannel}
                />
              </dl>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPublishReviewOpen(false)}
                disabled={isBusy}
                className="min-h-11 rounded-lg border border-gray-700 px-4 text-sm font-semibold text-gray-200 hover:bg-gray-800 disabled:opacity-50"
              >
                {tCommon('cancel')}
              </button>
              <button
                type="button"
                onClick={confirmPublish}
                disabled={isBusy}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-amber-500 px-5 text-sm font-bold text-black hover:bg-amber-400 disabled:opacity-50"
              >
                <Send size={15} />
                {activeAction === 'publish' ? tPublish('publishing') : tPublish('confirmPublish')}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

function ReviewItem({
  label,
  value,
  warn = false,
}: {
  label: string
  value: string | number
  warn?: boolean
}) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2">
      <dt className="text-gray-500">{label}</dt>
      <dd className={`mt-1 font-bold ${warn ? 'text-amber-300' : 'text-gray-100'}`}>{value}</dd>
    </div>
  )
}
