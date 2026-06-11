import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import { getMarketingPaths } from '@/lib/marketing-paths-request'
import { resolveAlbionDisplayName } from '@/lib/albion-display-name'

// 문서 홈에서 "내 길드 페이지" 로 바로 이동하는 배너. 로그인 + 길드 멤버 인 경우에만
// 노출 (비로그인/길드 미연결 사용자에게는 의미 없는 경로). 슬러그는 tenants 테이블
// 직접 조회 — getTenantDiscordConfig 등 helper 도 있지만 여기서는 slug 만 필요해서
// 가벼운 select 만 한다.
//
// 호스트별 path 차이는 getMarketingPaths(guildPage) 가 흡수: canonical/tenant
// 도메인이면 공식 root 의 `/g/<slug>`, preview/localhost 면 `/public/g/<slug>` 로 조합된다.
//
// 표시 이름은 resolveAlbionDisplayName 으로 — `/g/<slug>` 페이지와 동일한 우선순위
// (albion_home_guild_name → slug → Discord 폴백). Discord 길드명을 그대로 쓰면
// 한국어 ("멘헤라") 가 zh/en/ja 화면에 박혀 공개 surface 일관성을 깬다.
export default async function DocsMyGuildLink() {
  const session = await getSession()
  if (!session || !session.isMember) return null

  const [guildId, paths, t] = await Promise.all([
    getSessionGuildId(session),
    getMarketingPaths(),
    getTranslations('docsHome'),
  ])

  const db = getAdminClient()
  const { data } = await db
    .from('tenants')
    .select('slug, name')
    .eq('id', guildId)
    .maybeSingle()
  if (!data) return null

  const slug = data.slug as string
  const name = await resolveAlbionDisplayName(guildId, slug, data.name as string)

  return (
    <Link
      href={`${paths.guildPage}/${slug}`}
      className="not-prose flex items-center justify-between gap-3 my-4 px-4 py-3 rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/15 hover:border-amber-400/60 transition-colors"
    >
      <div className="min-w-0">
        <div className="text-amber-200 font-bold text-sm">
          {t('myGuildLinkTitle', { name })}
        </div>
        <p className="text-amber-100/70 text-xs mt-0.5">{t('myGuildLinkDescription')}</p>
      </div>
      <ExternalLink size={16} className="text-amber-300 flex-shrink-0" />
    </Link>
  )
}
