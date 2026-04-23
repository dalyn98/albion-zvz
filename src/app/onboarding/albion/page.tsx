import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getOnboardingState } from '@/app/actions/onboarding'
import AlbionOnboardingWizard from '@/components/AlbionOnboardingWizard'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ return?: string }>
}

// 알비온 닉네임 인증 온보딩. 멤버가 처음 로그인했을 때 강제 진입되며, 서버
// 선택 → 닉네임 검색 → 확인 3단계를 거친다. 수동 입력으로 우회 가능하지만
// 그 경우 [미인증] 상태가 되어 일부 기능이 제한된다.
export default async function AlbionOnboardingPage({ searchParams }: Props) {
  const session = await getSession()
  if (!session) {
    redirect('/api/auth/discord/start?returnTo=/onboarding/albion')
  }
  if (!session.isMember) {
    redirect('/')
  }

  const params = await searchParams
  const returnParam = params.return
  const safeReturn =
    typeof returnParam === 'string' && returnParam.startsWith('/') && !returnParam.startsWith('//')
      ? returnParam
      : '/me'

  const state = await getOnboardingState()
  const t = await getTranslations('albionOnboarding')

  return (
    <main className="flex-1 w-full max-w-xl mx-auto px-4 py-8 sm:py-12">
      <div className="text-center space-y-2 mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">{t('title')}</h1>
        <p className="text-sm text-gray-400 leading-relaxed">{t('description')}</p>
      </div>
      <AlbionOnboardingWizard
        discordNickname={session.username}
        initialIdentity={state.identity}
        homeGuildConfigured={state.homeGuildConfigured}
        returnTo={safeReturn}
      />
    </main>
  )
}
