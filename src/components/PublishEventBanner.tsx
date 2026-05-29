'use client'

// draft 이벤트 편집 화면 상단 배너.
//
// draft 상태에선 홈에 뜨지 않고 공개 링크 (/events/[id]) 도 404 로 나가므로,
// 편집이 끝나 공개할 준비가 되면 하단 저장 바의 "발행하기" 로 상태를 전이한다.
// 이 배너는 draft 상태 요약과 발행 전 누락 필드만 보여준다.
//
// 이 배너는 status=published 이벤트엔 렌더하지 않는다. 발행 후 다시 draft 로
// 돌리는 액션은 제공하지 않음 (실수로 공개된 이벤트는 삭제로 대응).

import { useTranslations } from 'next-intl'
import { AlertCircle } from 'lucide-react'
import type { Event } from '@/types'

interface Props {
  event: Event
  summary: {
    visibleSlots: number
    hiddenSlots: number
    assignedSlots: number
    emptySlots: number
    tentativeCount: number
    hasNotificationChannel: boolean
  }
}

export default function PublishEventBanner({ event, summary }: Props) {
  const t = useTranslations('publishEventBanner')

  // 서버 검증이 publishEvent 내부에서 이루어지지만, 최소한의 로컬 힌트를 위해
  // 누락 필드를 표시해 사용자가 "왜 발행이 안되는지" 를 바로 알 수 있게 한다.
  // gather_location 은 옵션 — 사전에 장소가 정해지지 않은 이벤트(즉석 결정,
  // TBD)도 발행 가능. 비어 있으면 공개 페이지/Discord embed 에서 위치 줄을
  // 통째로 숨긴다.
  const missing: string[] = []
  if (!event.title.trim()) missing.push(t('fieldTitle'))
  if (!event.gather_at) missing.push(t('fieldGatherAt'))
  const hasMissingSavedFields = missing.length > 0

  return (
    <div className="bg-amber-500/10 border border-amber-500/40 rounded-xl p-4">
      <div className="flex items-start gap-2 flex-1 min-w-0">
        <AlertCircle size={16} className="text-amber-400 mt-0.5 shrink-0" />
        <div className="space-y-2 min-w-0">
          <p className="text-sm font-semibold text-amber-200">{t('draftStatus')}</p>
          <p className="text-xs text-amber-100/80 leading-relaxed">
            {t('draftDescription')}
          </p>
          {hasMissingSavedFields && (
            <p className="text-xs text-amber-300 font-semibold">
              {t('missingRequired', { fields: missing.join(', ') })}
            </p>
          )}
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-1">
            <SummaryChip label={t('visibleSlots')} value={summary.visibleSlots} />
            <SummaryChip label={t('emptySlots')} value={summary.emptySlots} />
            <SummaryChip label={t('assignedSlots')} value={summary.assignedSlots} />
            <SummaryChip label={t('hiddenSlots')} value={summary.hiddenSlots} />
            <SummaryChip label={t('tentativeCount')} value={summary.tentativeCount} />
            <SummaryChip
              label={t('notificationChannel')}
              value={summary.hasNotificationChannel ? t('ready') : t('notSet')}
              tone={summary.hasNotificationChannel ? 'ok' : 'warn'}
            />
          </dl>
        </div>
      </div>
    </div>
  )
}

function SummaryChip({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: number | string
  tone?: 'neutral' | 'ok' | 'warn'
}) {
  const valueClass =
    tone === 'ok'
      ? 'text-emerald-300'
      : tone === 'warn'
        ? 'text-amber-300'
        : 'text-white'
  return (
    <div className="rounded-lg border border-amber-500/20 bg-black/15 px-2.5 py-1.5">
      <dt className="text-[10px] text-amber-100/60 leading-none">{label}</dt>
      <dd className={`mt-1 text-xs font-bold tabular-nums ${valueClass}`}>{value}</dd>
    </div>
  )
}
