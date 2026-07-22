'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Save, Send } from 'lucide-react'
import { publishEvent } from '@/app/actions/admin'
import { useEventEditSaveAll } from './EventEditSaveRegistry'
import { useToast } from '@/components/ToastProvider'

interface Props {
  // published 이벤트 저장 성공 시 상세 페이지로 이동할 때 사용. draft 는
  // 편집 화면에 남아 있어야 게시 전 추가 수정이 가능하다.
  eventId: string
  eventStatus: 'draft' | 'published'
  showPublishAction?: boolean
}

// 이벤트 편집 화면 하단 고정 저장 바. 등록된 섹션 전체를 순차 저장하고
// 에러를 모아 표시. 섹션별 save 버튼을 숨기고 이 바로만 커밋하게 한다.
export default function EventEditSaveBar({
  eventId,
  eventStatus,
  showPublishAction = false,
}: Props) {
  const ctx = useEventEditSaveAll()
  const t = useTranslations('adminEditEvent')
  const tCommon = useTranslations('common')
  const tPublish = useTranslations('publishEventBanner')
  const router = useRouter()
  const toast = useToast()
  const [activeAction, setActiveAction] = useState<'save' | 'publish' | null>(null)
  const [errors, setErrors] = useState<Array<{ id: string; label: string; error: string }>>([])
  const [justSaved, setJustSaved] = useState(false)
  const isBusy = activeAction !== null

  const focusSection = (id: string) => {
    const section = document.getElementById(`event-save-${id}`)
    if (!section) return
    section.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const target = section.querySelector<HTMLElement>('input, select, textarea, button')
    target?.focus({ preventScroll: true })
  }

  const handleClick = async () => {
    if (!ctx || isBusy) return
    setActiveAction('save')
    setErrors([])
    setJustSaved(false)
    const errs = await ctx.triggerSaveAll()
    setErrors(errs)
    setActiveAction(null)
    if (errs.length === 0) {
      setJustSaved(true)
      if (eventStatus === 'published') {
        router.push(`/events/${eventId}`)
      } else {
        router.refresh()
      }
    }
  }

  const handlePublish = async () => {
    if (!ctx || isBusy) return
    setActiveAction('publish')
    setErrors([])
    setJustSaved(false)
    const errs = await ctx.triggerSaveAll()
    if (errs.length > 0) {
      setErrors(errs)
      setActiveAction(null)
      return
    }
    const result = await publishEvent(eventId)
    if (result.error) {
      setErrors([{ id: 'publish', label: tPublish('publishButton'), error: result.error }])
      setActiveAction(null)
      return
    }
    if (result.warning) {
      toast.error(tPublish('publishedNotifyFailed', { error: result.warning }))
    }
    router.push('/admin/dashboard/events')
  }

  // 성공 플래시를 타이머 기반으로 한 번만 띄우되, 언마운트/재저장 시 이전
  // 타이머는 정리해야 state leak/경쟁을 피할 수 있다.
  useEffect(() => {
    if (!justSaved) return
    const h = setTimeout(() => setJustSaved(false), 2000)
    return () => clearTimeout(h)
  }, [justSaved])

  return (
    <div className="sticky bottom-0 left-0 right-0 z-30 -mx-4 sm:mx-0 mt-6 bg-gray-950/95 backdrop-blur border-t border-gray-800 px-4 py-3">
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
          <span className="text-amber-300 text-xs">{t('unsavedChanges')}</span>
        )}
        {justSaved && (
          <span className="text-green-400 text-xs">{t('saveAllSuccess')}</span>
        )}
        <button
          type="button"
          onClick={handleClick}
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
            onClick={handlePublish}
            disabled={isBusy || !ctx}
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold px-6 py-2.5 rounded-lg transition-colors"
          >
            <Send size={15} />
            {activeAction === 'publish' ? tPublish('publishing') : tPublish('publishButton')}
          </button>
        )}
      </div>
    </div>
  )
}
