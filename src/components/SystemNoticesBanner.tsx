import { Megaphone } from 'lucide-react'
import { listActiveSystemNotices } from '@/lib/super-admin-notices'

// 모든 테넌트의 모든 사용자에게 노출되는 글로벌 시스템 공지 배너.
// 슈퍼어드민이 발행 (super_admin_notices 테이블) → 활성 row 가 있으면 페이지
// 최상단에 표시. 닫기 버튼 없음 (DismissibleNoticeBanner 와 동일 정책).
//
// 조회는 짧은 공유 캐시를 사용하고 생성/보관 action 이 즉시 tag 를 무효화한다.
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
                  width={512}
                  height={128}
                  className="h-32 w-auto max-w-full rounded-md border border-rose-500/20 object-contain"
                />
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
