import { getTranslations } from 'next-intl/server'
import { cookies } from 'next/headers'
import TenantAlbionSetupForm from '@/components/TenantAlbionSetupForm'
import { ALBION_SERVERS, ALBION_SERVER_LABEL_KEY, getGuild } from '@/lib/albion-gameinfo'
import { AODP_ALLOWED_CITIES, AODP_CITY_LABEL_KEY } from '@/lib/shop/aodp-constants'
import { AGM_BATTLES_CONNECT_INTENT_COOKIE } from '@/lib/agm-battles-connect-intent'
import { verifyAgmBattlesConnectIntent } from '@/lib/oauth-state'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

// 위저드 2단계: 알비온 서버 + 홈 길드. 세션/소유권 검증은 상위 레이아웃에서
// 이미 끝난 상태 — 여기서는 form 만 그린다.
export default async function TenantAlbionSetupPage({ params }: Props) {
  const { id } = await params
  const [t, tCommon] = await Promise.all([
    getTranslations('onboard'),
    getTranslations('common'),
  ])
  const cookieStore = await cookies()
  const intent = await verifyAgmBattlesConnectIntent(
    cookieStore.get(AGM_BATTLES_CONNECT_INTENT_COOKIE)?.value,
  )
  const intendedGuild = intent
    ? await getGuild(intent.server, intent.guildAlbionId)
    : null
  const initialSelection = intent && intendedGuild?.Name
    ? {
        server: intent.server,
        guildId: intent.guildAlbionId,
        guildName: intendedGuild.Name,
      }
    : null

  // 서버 라벨/힌트 — common 네임스페이스의 단일 진실 원천에서 풀어 props 로 전달.
  // 같은 ALBION_SERVERS 를 사용해 폼/페이지가 어긋나지 않게 컴파일 타임 보장.
  const albionServerLabels = Object.fromEntries(
    ALBION_SERVERS.map((s) => [s, tCommon(ALBION_SERVER_LABEL_KEY[s])]),
  ) as Record<(typeof ALBION_SERVERS)[number], string>
  const albionServerHints = Object.fromEntries(
    ALBION_SERVERS.map((s) => [s, t(`albionServerHint_${s}` as const)]),
  ) as Record<(typeof ALBION_SERVERS)[number], string>
  const albionAodpCityLabels = Object.fromEntries(
    AODP_ALLOWED_CITIES.map((city) => [city, tCommon(AODP_CITY_LABEL_KEY[city])]),
  ) as Record<(typeof AODP_ALLOWED_CITIES)[number], string>

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
        initialSelection={initialSelection}
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
          albionServerLabels,
          albionServerHints,
          albionServerSelectHint: t('albionServerSelectHint'),
          albionAodpCityLabel: t('albionAodpCityLabel'),
          albionAodpCityHelp: t('albionAodpCityHelp'),
          albionAodpCityLabels,
          nextButton: t('nextButton'),
          savingButton: t('savingButton'),
          errorGeneric: t('errorGeneric'),
          ownershipDisputeTitle: t('ownershipDisputeTitle'),
          ownershipDisputeBody: t('ownershipDisputeBody'),
          ownershipDisputeEvidenceLabel: t('ownershipDisputeEvidenceLabel'),
          ownershipDisputeEvidencePlaceholder: t('ownershipDisputeEvidencePlaceholder'),
          ownershipDisputeSubmit: t('ownershipDisputeSubmit'),
          ownershipDisputeSubmitting: t('ownershipDisputeSubmitting'),
          ownershipDisputeSubmitted: t('ownershipDisputeSubmitted'),
        }}
      />
    </>
  )
}
