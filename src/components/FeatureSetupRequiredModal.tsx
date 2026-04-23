'use client'

import Link from 'next/link'
import { AlertTriangle, ArrowRight, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface Props {
  title: string
  body: string
  settingsHref: string
  settingsLabel: string
  onClose: () => void
}

// 특정 기능을 사용하려면 먼저 관리자 설정이 필요할 때 띄우는 공용 모달.
// 예: 밤스쿼드 파티 콜러 — 콜러 역할/인원이 없으면 콜러 드롭다운이 비어버리므로
// 토글을 켜기 전에 여기서 설정 경로로 안내.
export default function FeatureSetupRequiredModal({
  title,
  body,
  settingsHref,
  settingsLabel,
  onClose,
}: Props) {
  const tCommon = useTranslations('common')
  return (
    <div
      className="fixed inset-0 z-[80] bg-black/70 flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-amber-500/40 rounded-2xl w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-5 pt-5">
          <div className="mt-0.5 p-2 rounded-full bg-amber-500/15 text-amber-300">
            <AlertTriangle size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-bold text-base">{title}</h3>
            <p className="text-gray-300 text-sm mt-1.5 leading-relaxed whitespace-pre-line">
              {body}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-white -mt-1 -mr-1"
            aria-label={tCommon('close')}
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 mt-4 border-t border-gray-800">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-300 hover:text-white"
          >
            {tCommon('cancel')}
          </button>
          <Link
            href={settingsHref}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-200"
          >
            {settingsLabel}
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  )
}
