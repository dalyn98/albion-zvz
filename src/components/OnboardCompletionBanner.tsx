'use client'

import { useState } from 'react'
import Link from 'next/link'
import { BookOpen, CalendarPlus, PartyPopper, Settings, X } from 'lucide-react'

interface Props {
  title: string
  description: string
  linkLabel: string
  guideLinkLabel: string
  firstEventLabel: string
  dismissLabel: string
}

// /admin/dashboard?onboarded=1 쿼리로 진입한 경우에만 렌더. Dismiss 는 로컬
// state 로만 처리 — 새로고침하면 query 가 유지되는 한 다시 보인다. 영구 dismiss
// 는 따로 저장하지 않는다 (사용자는 보통 완료 후 한 번만 보게 됨).
export default function OnboardCompletionBanner({
  title,
  description,
  linkLabel,
  guideLinkLabel,
  firstEventLabel,
  dismissLabel,
}: Props) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  return (
    <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4 sm:p-5 flex items-start gap-3">
      <PartyPopper size={18} className="text-emerald-300 mt-0.5 flex-shrink-0" />
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <h2 className="text-sm font-semibold text-emerald-200">{title}</h2>
          <p className="text-xs text-emerald-100/80 mt-1 leading-relaxed">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link
            href="/admin/dashboard/events/new"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-emerald-300 px-3 text-xs font-bold text-emerald-950 hover:bg-emerald-200"
          >
            <CalendarPlus size={13} />
            {firstEventLabel}
          </Link>
          <Link
            href="/admin/dashboard/guide"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-100 hover:text-white underline-offset-4 hover:underline"
          >
            <BookOpen size={12} />
            {guideLinkLabel}
          </Link>
          <Link
            href="/admin/dashboard/settings?tab=features"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-100 hover:text-white underline-offset-4 hover:underline"
          >
            <Settings size={12} />
            {linkLabel}
          </Link>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label={dismissLabel}
        className="flex-shrink-0 text-emerald-200/60 hover:text-emerald-100 p-1"
      >
        <X size={14} />
      </button>
    </div>
  )
}
