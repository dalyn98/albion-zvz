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
import type { Event } from '@/types'

interface Props {
  event: Event
}

export default function PublishEventBanner({ event }: Props) {
  const router = useRouter()
  const t = useTranslations('publishEventBanner')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 서버 검증이 publishEvent 내부에서 이루어지지만, 최소한의 로컬 힌트를 위해
  // 누락 필드를 표시해 사용자가 "왜 발행이 안되는지" 를 바로 알 수 있게 한다.
  const missing: string[] = []
  if (!event.title.trim()) missing.push(t('fieldTitle'))
  if (!event.gather_at) missing.push(t('fieldGatherAt'))
  if (!event.gather_location.trim()) missing.push(t('fieldGatherLocation'))
  const canPublishLocally = missing.length === 0

  const handlePublish = async () => {
    setError(null)
    setLoading(true)
    // 편집 폼의 dirty 상태가 있을 수 있지만, 발행은 DB 에 저장된 값을 기준으로
    // 한다. 사용자가 편집 후 저장하지 않고 발행하면 최신 편집은 반영되지 않음 —
    // 그래서 안내 문구에서 "저장 후 발행" 을 권장하고 있다.
    const result = await publishEvent(event.id, {
      title: event.title,
      gather_at: event.gather_at ?? '',
      gather_time: event.gather_time,
      gather_location: event.gather_location,
      special_notes: event.special_notes,
      notify_role_id: event.notify_role_id,
      notify_channel_id: event.notify_channel_id,
    })
    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }
    router.refresh()
  }

  return (
    <div className="bg-amber-500/10 border border-amber-500/40 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-start gap-2 flex-1 min-w-0">
        <AlertCircle size={16} className="text-amber-400 mt-0.5 shrink-0" />
        <div className="space-y-1 min-w-0">
          <p className="text-sm font-semibold text-amber-200">{t('draftStatus')}</p>
          <p className="text-xs text-amber-100/80 leading-relaxed">
            {t('draftDescription')}
          </p>
          {!canPublishLocally && (
            <p className="text-xs text-amber-300 font-semibold">
              {t('missingRequired', { fields: missing.join(', ') })}
            </p>
          )}
          {error && <p className="text-xs text-red-300">{error}</p>}
        </div>
      </div>
      <button
        type="button"
        onClick={handlePublish}
        disabled={loading || !canPublishLocally}
        className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-4 py-2 rounded-lg transition-colors text-sm shrink-0"
      >
        <Send size={14} />
        {loading ? t('publishing') : t('publishButton')}
      </button>
    </div>
  )
}
