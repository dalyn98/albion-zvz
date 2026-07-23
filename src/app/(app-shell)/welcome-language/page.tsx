import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { sanitizeInternalReturnTo } from '@/lib/safe-return-to'
import { getMyPreferredLanguage } from '@/app/actions/language'
import WelcomeLanguageForm from '@/components/WelcomeLanguageForm'
import { buildLoginEntryHref, buildReturnToWithSearchParams } from '@/lib/login-entry'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ return?: string }>
}

// Discord 로그인 직후 preferred_language 가 null 인 유저를 여기로 보낸다
// (콜백 라우트의 resolvePostLoginPath 참조). 이미 선택한 유저가 URL 로 직접
// 진입한 경우 return 파라미터가 가리키는 곳(기본 /)으로 바로 돌려보낸다 —
// 선택 UI 를 한 번 더 보여주는 건 혼란만 주기 때문.
export default async function WelcomeLanguagePage({ searchParams }: Props) {
  const [session, params] = await Promise.all([getSession(), searchParams])
  if (!session) {
    const returnParams = new URLSearchParams()
    if (params.return) returnParams.set('return', params.return)
    redirect(buildLoginEntryHref({
      returnTo: buildReturnToWithSearchParams('/welcome-language', returnParams),
    }))
  }

  const returnParam = params.return
  const safeReturn = sanitizeInternalReturnTo(returnParam)

  const { locale } = await getMyPreferredLanguage()
  if (locale) {
    redirect(safeReturn)
  }

  const t = await getTranslations('welcomeLanguage')

  return (
    <main className="flex-1 w-full max-w-md mx-auto px-4 py-10 sm:py-16">
      <div className="text-center space-y-2 mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">{t('title')}</h1>
        <p className="text-sm text-gray-400">{t('description')}</p>
      </div>
      <WelcomeLanguageForm returnTo={safeReturn} />
    </main>
  )
}
