'use client'

// 어드민이 페이지에서 직접 공지를 만들고 편집할 수 있게 해주는 인라인 래퍼.
// 종전에는 어드민 설정 페이지의 별도 카드에서만 편집할 수 있었지만, 공지를
// 보는 위치 (홈/리기어 페이지 상단) 에서 바로 손볼 수 있도록 옮긴 것.
//
//   편집 권한 없음 → 공지가 있으면 배너만, 없으면 null
//   편집 권한 있음 + 공지 없음 → "공지 추가" 점선 버튼 (배너가 들어갈 자리)
//   편집 권한 있음 + 공지 있음 → 배너 + 우상단 펜 아이콘
// 펜 / 추가 버튼 모두 `NoticeSettingForm` 을 모달로 띄운다 (embedded=true).

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Pencil, Plus, X, Megaphone } from 'lucide-react'
import DismissibleNoticeBanner from './DismissibleNoticeBanner'
import NoticeSettingForm, { NOTICE_MAX_LENGTH } from './NoticeSettingForm'
import type { NoticeTarget } from '@/app/actions/notice-image'
import type { AppSettingKey } from '@/lib/app-settings'
import { useBodyScrollLock } from './useBodyScrollLock'

type InlineNoticeTarget = Extract<NoticeTarget, 'events' | 'regear'>

interface Props {
  message: string
  imageUrl: string
  target: InlineNoticeTarget
  canManageNotice: boolean
}

const SETTING_KEY_BY_TARGET: Record<InlineNoticeTarget, AppSettingKey> = {
  events: 'events_notice_message',
  regear: 'regear_notice_message',
}

const NOTICE_NAMESPACE_BY_TARGET: Record<InlineNoticeTarget, 'adminEventsNotice' | 'adminRegearNotice'> = {
  events: 'adminEventsNotice',
  regear: 'adminRegearNotice',
}

export default function NoticeBannerWithAdmin({
  message,
  imageUrl,
  target,
  canManageNotice,
}: Props) {
  const [open, setOpen] = useState(false)
  const tBanner = useTranslations('noticeBannerAdmin')
  const tCommon = useTranslations('common')
  const tNotice = useTranslations(NOTICE_NAMESPACE_BY_TARGET[target])
  useBodyScrollLock(open)

  useEffect(() => {
    if (!open) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const trimmed = message.trim()
  const trimmedImage = imageUrl.trim()
  const hasNotice = trimmed.length > 0 || trimmedImage.length > 0

  if (!canManageNotice && !hasNotice) return null

  return (
    <>
      {hasNotice ? (
        <div className="relative">
          <DismissibleNoticeBanner message={message} imageUrl={imageUrl} />
          {canManageNotice && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="absolute top-2 right-2 flex h-10 w-10 items-center justify-center rounded-md bg-amber-500/20 text-amber-100 transition-colors hover:bg-amber-500/40"
              title={tBanner('editTooltip')}
              aria-label={tBanner('editTooltip')}
            >
              <Pencil size={13} />
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full flex items-center justify-center gap-2 border border-dashed border-amber-500/40 hover:border-amber-400 hover:bg-amber-500/5 text-amber-300 hover:text-amber-200 rounded-lg px-4 py-3 text-sm transition-colors"
        >
          <Plus size={14} />
          <Megaphone size={14} />
          <span>{tBanner('addLabel')}</span>
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-8"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="notice-admin-modal-title"
            className="w-full max-w-2xl bg-gray-900 border border-gray-700 rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-end px-3 py-2">
              <h2 id="notice-admin-modal-title" className="sr-only">{tNotice('title')}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md text-gray-400 hover:bg-gray-800 hover:text-white"
                aria-label={tCommon('close')}
              >
                <X size={18} />
              </button>
            </div>
            <div className="px-5 pb-5">
              <NoticeSettingForm
                embedded
                settingKey={SETTING_KEY_BY_TARGET[target]}
                target={target}
                initialMessage={message}
                initialImageUrl={imageUrl}
                title={tNotice('title')}
                description={tNotice('description')}
                label={tNotice('label')}
                placeholder={tNotice('placeholder')}
                clearLabel={tNotice('clear')}
                clearTooltip={tNotice('clearTooltip')}
                tooLongMessage={tNotice('tooLong', { max: NOTICE_MAX_LENGTH })}
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
