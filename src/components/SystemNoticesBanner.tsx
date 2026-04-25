import { Megaphone } from 'lucide-react'
import { listActiveSystemNotices } from '@/lib/super-admin-notices'

// 모든 테넌트의 모든 사용자에게 노출되는 글로벌 시스템 공지 배너.
// 슈퍼어드민이 발행 (super_admin_notices 테이블) → 활성 row 가 있으면 페이지
// 최상단에 표시. 닫기 버튼 없음 (DismissibleNoticeBanner 와 동일 정책).
//
// SSR 페이지 마다 한 번 호출되지만 인덱스가 있고 결과는 보통 0~1 row 라
// 부담은 매우 작다. 리액티브 캐시를 끼우면 발행 후 반영 지연이 생기므로
// 그대로 매 요청 조회.
export default async function SystemNoticesBanner() {
  const notices = await listActiveSystemNotices()
  if (notices.length === 0) return null

  return (
    <div className="space-y-2">
      {notices.map((n) => (
        <div
          key={n.id}
          className="bg-rose-500/10 border-b border-rose-500/30 px-4 py-2.5"
        >
          <div className="max-w-7xl mx-auto flex items-start gap-3">
            <Megaphone size={14} className="text-rose-300 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              {n.message && (
                <p className="text-rose-100 text-sm whitespace-pre-wrap break-words">
                  {n.message}
                </p>
              )}
              {n.imageUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={n.imageUrl}
                  alt=""
                  className="max-h-32 rounded-md border border-rose-500/20"
                />
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
