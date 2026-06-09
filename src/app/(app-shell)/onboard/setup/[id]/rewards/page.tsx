import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { getAppSetting } from '@/lib/app-settings'
import TenantRewardsSetupForm from '@/components/TenantRewardsSetupForm'
import { SLOT_ROLES } from '@/types'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

// 위저드 3단계 (최종): 리기어 정책 + 역할별 기본 실버. 세션/소유권 검증은 상위
// 레이아웃 담당. bot-callback 이 tenant 생성 시 SLOT_ROLES 를 silver=0 으로 seed
// 해놓았으므로 여기서는 그 값을 읽어 폼 초기값으로 넘긴다. 정책 토글들도 같은
// 기본값 (admin 설정 페이지와 동일) 을 폼에 노출 — 저장은 saveTenantRewards 가
// rewards + app_settings 5개 키를 한 번에 처리한다.
export default async function TenantRewardsSetupPage({ params }: Props) {
  const { id } = await params
  const t = await getTranslations('onboard')

  const db = getAdminClient()
  const [
    rewardsRes,
    autoRegearRaw,
    craftRegearRaw,
    requireVerificationRaw,
    payoutRateRaw,
    eventsAutoStartRaw,
  ] = await Promise.all([
    db.from('role_rewards').select('role_name, silver').eq('guild_id', id).order('role_name'),
    getAppSetting('auto_regear_enabled', 'false', id),
    getAppSetting('craft_regear_enabled', 'false', id),
    getAppSetting('regear_require_verification', 'true', id),
    getAppSetting('regear_payout_rate_percent', '100', id),
    getAppSetting('events_auto_start_enabled', 'false', id),
  ])

  const existing = new Map<string, number>()
  for (const r of (rewardsRes.data ?? []) as Array<{ role_name: string; silver: number }>) {
    existing.set(r.role_name, Number.isFinite(r.silver) ? r.silver : 0)
  }
  const initial = SLOT_ROLES.map((role_name) => ({
    role_name,
    silver: existing.get(role_name) ?? 0,
  }))

  const parsedPayout = Number(payoutRateRaw)
  const initialPayoutRate =
    Number.isFinite(parsedPayout) &&
    Number.isInteger(parsedPayout) &&
    parsedPayout >= 1 &&
    parsedPayout <= 100
      ? parsedPayout
      : 100

  return (
    <>
      <div className="space-y-2 mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">
          {t('rewardsStepTitle')}
        </h1>
        <p className="text-sm text-gray-400">{t('rewardsStepDescription')}</p>
      </div>
      <TenantRewardsSetupForm
        tenantId={id}
        initial={initial}
        initialPolicy={{
          autoRegearEnabled: autoRegearRaw === 'true',
          craftRegearEnabled: craftRegearRaw === 'true',
          regearRequireVerification: requireVerificationRaw !== 'false',
          regearPayoutRatePercent: initialPayoutRate,
          eventsAutoStartEnabled: eventsAutoStartRaw === 'true',
        }}
        labels={{
          rewardsRoleColumn: t('rewardsRoleColumn'),
          rewardsSilverColumn: t('rewardsSilverColumn'),
          rewardsSilverHelp: t('rewardsSilverHelp'),
          rewardsErrorInvalidSilver: t('rewardsErrorInvalidSilver'),
          policySectionTitle: t('policySectionTitle'),
          policySectionDescription: t('policySectionDescription'),
          policyAutoLabel: t('policyAutoLabel'),
          policyAutoHint: t('policyAutoHint'),
          policyCraftLabel: t('policyCraftLabel'),
          policyCraftHint: t('policyCraftHint'),
          policyVerifyLabel: t('policyVerifyLabel'),
          policyVerifyHint: t('policyVerifyHint'),
          policyPayoutLabel: t('policyPayoutLabel'),
          policyPayoutHint: t('policyPayoutHint'),
          policyPayoutSuffix: t('policyPayoutSuffix'),
          policyErrorInvalidPayout: t('policyErrorInvalidPayout'),
          eventsSectionTitle: t('eventsSectionTitle'),
          eventsSectionDescription: t('eventsSectionDescription'),
          eventsAutoStartLabel: t('eventsAutoStartLabel'),
          eventsAutoStartHint: t('eventsAutoStartHint'),
          rewardsSectionTitle: t('rewardsSectionTitle'),
          rewardsSectionDescription: t('rewardsSectionDescription'),
          finishButton: t('finishButton'),
          finishingButton: t('finishingButton'),
          errorGeneric: t('errorGeneric'),
        }}
      />
    </>
  )
}
