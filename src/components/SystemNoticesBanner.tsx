import { getTranslations } from 'next-intl/server'
import { listActiveSystemNotices } from '@/lib/super-admin-notices'
import SystemNoticeBannerClient from '@/components/SystemNoticeBannerClient'

// 모든 테넌트의 모든 사용자에게 노출되는 글로벌 시스템 공지 배너.
// 슈퍼어드민이 발행 (super_admin_notices 테이블) → 활성 row 가 있으면 페이지
// 최상단에 최대 한 건 표시. important 는 사용자별로 닫을 수 있고 critical 은
// 만료 전까지 닫을 수 없다.
//
// 조회는 짧은 공유 캐시를 사용하고 생성/보관 action 이 즉시 tag 를 무효화한다.
export default async function SystemNoticesBanner() {
  const notices = await listActiveSystemNotices()
  if (notices.length === 0) return null
  const notice = notices[0]
  const t = await getTranslations('systemNoticeBanner')

  return (
    <SystemNoticeBannerClient
      id={notice.id}
      message={notice.message}
      imageUrl={notice.imageUrl}
      severity={notice.severity}
      dismissLabel={t('dismiss')}
    />
  )
}
