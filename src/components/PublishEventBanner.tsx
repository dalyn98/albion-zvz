'use client'

// draft 이벤트 편집 화면 상단 배너.
//
// draft 상태에선 홈에 뜨지 않고 공개 링크 (/events/[id]) 도 404 로 나가므로,
// 편집이 끝나 공개할 준비가 되면 이 배너의 "발행하기" 버튼으로 상태를 전이시킨다.
// 버튼 동작:
//   1. EventInfoForm 에 입력된 필수값 (제목 / 날짜 / 장소) 이 채워져 있는지
//      서버 publishEvent 가 재검증. 비어 있으면 에러만 띄우고 상태 그대로.
//   2. 상태 전이만 수행. Discord 공지는 별도 버튼 (대시보드의 종 아이콘) 에서.
//
// 이 배너는 status=published 이벤트엔 렌더하지 않는다. 발행 후 다시 draft 로
// 돌리는 액션은 제공하지 않음 (실수로 공개된 이벤트는 삭제로 대응).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Send, AlertCircle } from 'lucide-react'
import { publishEvent } from '@/app/actions/admin'
import { useEventEditSaveAll } from './EventEditSaveRegistry'
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
  const router = useRouter()
  const t = useTranslations('publishEventBanner')
  const saveCtx = useEventEditSaveAll()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 서버 검증이 publishEvent 내부에서 이루어지지만, 최소한의 로컬 힌트를 위해
  // 누락 필드를 표시해 사용자가 "왜 발행이 안되는지" 를 바로 알 수 있게 한다.
  // gather_location 은 옵션 — 사전에 장소가 정해지지 않은 이벤트(즉석 결정,
  // TBD)도 발행 가능. 비어 있으면 공개 페이지/Discord embed 에서 위치 줄을
  // 통째로 숨긴다.
  const missing: string[] = []
  if (!event.title.trim()) missing.push(t('fieldTitle'))
  if (!event.gather_at) missing.push(t('fieldGatherAt'))
  const hasMissingSavedFields = missing.length > 0

  const handlePublish = async () => {
    setError(null)
    setLoading(true)
    // "발행하기" = 현재 편집 중인 모든 섹션을 저장한 뒤 publishEvent 로 상태를
    // 전이. 사용자가 발행 직전 빠뜨린 변경 사항이 누락되지 않도록 publish 와
    // save 를 한 번의 사용자 액션으로 묶는다.
    if (saveCtx) {
      const errors = await saveCtx.triggerSaveAll()
      if (errors.length > 0) {
        setError(errors.map((e) => `${e.label}: ${e.error}`).join(' / '))
        setLoading(false)
        return
      }
    }
    const result = await publishEvent(event.id)
    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }
    // 발행은 성공했지만 자동 알림이 실패한 경우 — 발행 자체는 막지 않고
    // 사용자에게 알림 실패 사유를 alert 로 알려준다. 종 버튼으로 수동 재시도
    // 가능하므로 페이지 이동은 정상 진행.
    if (result.warning) {
      alert(t('publishedNotifyFailed', { error: result.warning }))
    }
    // 발행 성공 시 이벤트 목록(대시보드)으로 이동 — 편집 화면에 머무르면 발행 후
    // 또 무엇을 해야 할지 사용자가 망설이게 된다. publishEvent 가 이미 dashboard
    // 경로를 revalidate 했으므로 새 상태로 바로 표시된다.
    router.push('/admin/dashboard')
  }

  return (
    <div className="bg-amber-500/10 border border-amber-500/40 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
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
          {error && <p className="text-xs text-red-300">{error}</p>}
        </div>
      </div>
      <button
        type="button"
        onClick={handlePublish}
        disabled={loading}
        className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-4 py-2 rounded-lg transition-colors text-sm shrink-0"
      >
        <Send size={14} />
        {loading ? t('publishing') : t('publishButton')}
      </button>
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
