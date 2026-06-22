import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { ExternalLink, Globe } from 'lucide-react'
import MarketingNav from '@/components/MarketingNav'

// 공개 프로필이 비활성/미설정 상태인 길드의 안내 화면. 두 케이스 동일 구조:
//   - active + showProfile=false  → "아직 켜지지 않음" / 어드민 CTA → /admin/dashboard/guild-profile
//   - pending (위저드 미완료)       → "아직 설정 중" / 어드민 CTA → /onboard (위저드 이어 진행)
// 둘 다 amber 액센트로 사이트 톤 유지. generateMetadata 가 이 두 케이스에 noindex 처리.
export default async function GuildProfileDisabledState({
  displayName,
  pending,
}: {
  displayName: string
  pending?: boolean
}) {
  const t = await getTranslations('publicGuildProfile')
  const heading = pending ? t('pendingHeading') : t('disabledHeading')
  const body = pending ? t('pendingBody') : t('disabledBody')
  const adminCta = pending ? t('pendingAdminCta') : t('disabledAdminCta')
  const adminHref = pending ? '/onboard' : '/admin/dashboard/guild-profile'
  return (
    <>
      <MarketingNav />
      <div className="min-h-screen bg-[#08090d] text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/15 via-orange-700/10 to-black pointer-events-none" />
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
        <div className="relative max-w-2xl mx-auto px-4 sm:px-6 py-24 sm:py-32 text-center space-y-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500/15 ring-1 ring-amber-500/30">
            <Globe size={28} className="text-amber-300" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight break-words">
            {displayName}
          </h1>
          <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-amber-300/90">
            {heading}
          </p>
          <p className="text-gray-300 text-sm sm:text-base leading-relaxed max-w-lg mx-auto">
            {body}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
            <Link
              href={adminHref}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-3 text-sm font-bold text-black shadow-lg transition-[background-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:bg-amber-400 hover:shadow-2xl active:scale-[0.96]"
            >
              {adminCta}
              <ExternalLink size={14} />
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-2 border border-gray-700 hover:border-gray-500 text-gray-200 font-semibold px-5 py-3 rounded-lg text-sm transition-colors"
            >
              {t('disabledHomeCta')}
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
