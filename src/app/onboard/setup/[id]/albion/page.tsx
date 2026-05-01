import { getTranslations } from 'next-intl/server'
import TenantAlbionSetupForm from '@/components/TenantAlbionSetupForm'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

// 위저드 2단계: 알비온 서버 + 홈 길드. 세션/소유권 검증은 상위 레이아웃에서
// 이미 끝난 상태 — 여기서는 form 만 그린다.
export default async function TenantAlbionSetupPage({ params }: Props) {
  const { id } = await params
  const t = await getTranslations('onboard')

  return (
    <>
      <div className="space-y-2 mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">
          {t('albionStepTitle')}
        </h1>
        <p className="text-sm text-gray-400">{t('albionStepDescription')}</p>
      </div>
      <TenantAlbionSetupForm
        tenantId={id}
        labels={{
          albionServerLabel: t('albionServerLabel'),
          albionServerHelp: t('albionServerHelp'),
          albionHomeGuildLabel: t('albionHomeGuildLabel'),
          albionHomeGuildHelp: t('albionHomeGuildHelp'),
          albionGuildSearchPlaceholder: t('albionGuildSearchPlaceholder'),
          albionGuildNoResults: t('albionGuildNoResults'),
          albionSelectedGuild: t('albionSelectedGuild'),
          albionClearGuild: t('albionClearGuild'),
          albionNoHomeGuild: t('albionNoHomeGuild'),
          albionServerWest: t('albionServerWest'),
          albionServerEast: t('albionServerEast'),
          albionServerEurope: t('albionServerEurope'),
          albionAodpCityLabel: t('albionAodpCityLabel'),
          albionAodpCityHelp: t('albionAodpCityHelp'),
          nextButton: t('nextButton'),
          skipButton: t('skipButton'),
          savingButton: t('savingButton'),
          errorGeneric: t('errorGeneric'),
        }}
      />
    </>
  )
}
