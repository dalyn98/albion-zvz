'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ShieldCheck } from 'lucide-react'
import AlbionOnboardingWizard from './AlbionOnboardingWizard'
import type { MemberAlbionIdentity } from '@/lib/albion-identity'

interface Props {
  discordNickname: string
  initialIdentity: MemberAlbionIdentity | null
  homeGuildConfigured: boolean
}

// 로그인 직후 랜딩 위에 덮이는 강제 온보딩 모달. 닫기 버튼은 없고, 위자드
// 마지막 단계의 "완료" 가 router.refresh() 로 guild_avatars.albion_server 를
// 재조회하게 해 자연스럽게 사라진다 (layout 이 다시 렌더하며 modal 을 mount
// 하지 않음).
export default function AlbionOnboardingModal({
  discordNickname,
  initialIdentity,
  homeGuildConfigured,
}: Props) {
  const t = useTranslations('albionOnboarding')
  const router = useRouter()

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="albion-onboarding-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4 py-6 overflow-y-auto"
    >
      <div className="w-full max-w-md bg-[#0f1117] border border-gray-800 rounded-2xl shadow-2xl p-5 sm:p-6 my-auto">
        <div className="flex items-start gap-2 mb-5">
          <ShieldCheck size={18} className="text-amber-400 mt-0.5 flex-shrink-0" />
          <div>
            <h2 id="albion-onboarding-title" className="text-lg font-bold text-white">
              {t('title')}
            </h2>
            <p className="text-xs text-gray-500 leading-relaxed mt-1">{t('description')}</p>
          </div>
        </div>
        <AlbionOnboardingWizard
          discordNickname={discordNickname}
          initialIdentity={initialIdentity}
          homeGuildConfigured={homeGuildConfigured}
          returnTo="/"
          onFinish={() => router.refresh()}
        />
      </div>
    </div>
  )
}
