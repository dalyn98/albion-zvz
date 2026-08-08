import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { getAppSetting } from '@/lib/app-settings'
import TenantRewardsSetupForm from '@/components/TenantRewardsSetupForm'
import { SLOT_ROLES } from '@/types'
import { isValidRoleRegearPayoutRate } from '@/lib/regear-payout'
import { parseRegearSupportState } from '@/lib/regear-support'

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
    regearSupportRaw,
    autoRegearRaw,
    craftRegearRaw,
    requireVerificationRaw,
    payoutRateRaw,
    participationAutoCloseoutRaw,
  ] = await Promise.all([
    db
      .from('role_rewards')
      .select('role_name, silver, payout_rate_percent')
      .eq('guild_id', id)
      .order('role_name'),
    getAppSetting('regear_support_enabled', '', id),
    getAppSetting('auto_regear_enabled', 'false', id),
    getAppSetting('craft_regear_enabled', '', id),
    getAppSetting('regear_require_verification', 'true', id),
    getAppSetting('regear_payout_rate_percent', '100', id),
    getAppSetting('event_participation_auto_closeout_enabled', '', id),
  ])

  const parsedPayout = Number(payoutRateRaw)
  const initialPayoutRate =
    Number.isFinite(parsedPayout) &&
    Number.isInteger(parsedPayout) &&
    parsedPayout >= 1 &&
    parsedPayout <= 100
      ? parsedPayout
      : 100

  const existing = new Map<string, { silver: number; payoutRatePercent: number }>()
  for (const r of (rewardsRes.data ?? []) as Array<{
    role_name: string
    silver: number
    payout_rate_percent: number | null
  }>) {
    const payoutRatePercent = Number(r.payout_rate_percent)
    existing.set(r.role_name, {
      silver: Number.isFinite(r.silver) ? r.silver : 0,
      payoutRatePercent: isValidRoleRegearPayoutRate(payoutRatePercent)
        ? payoutRatePercent
        : initialPayoutRate,
    })
  }
  const initial = SLOT_ROLES.map((role_name) => ({
    role_name,
    silver: existing.get(role_name)?.silver ?? 0,
    payout_rate_percent: existing.get(role_name)?.payoutRatePercent ?? initialPayoutRate,
  }))

  return (
    <>
      <div className="space-y-2 mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">{t('rewardsStepTitle')}</h1>
        <p className="text-sm text-gray-400">{t('rewardsStepDescription')}</p>
      </div>
      <TenantRewardsSetupForm
        tenantId={id}
        initial={initial}
        initialPolicy={{
          regearSupportEnabled:
            parseRegearSupportState(regearSupportRaw) === 'unconfigured'
              ? null
              : regearSupportRaw === 'true',
          autoRegearEnabled: autoRegearRaw === 'true',
          craftRegearEnabled:
            craftRegearRaw === 'true'
              ? true
              : craftRegearRaw === 'false'
                ? false
                : null,
          regearRequireVerification: requireVerificationRaw !== 'false',
          regearPayoutRatePercent: initialPayoutRate,
          participationAutoCloseoutEnabled:
            participationAutoCloseoutRaw === 'true'
              ? true
              : participationAutoCloseoutRaw === 'false'
                ? false
                : null,
        }}
        labels={{
          quickStartTitle: t('quickStartTitle'),
          quickStartDescription: t('quickStartDescription'),
          supportSectionTitle: t('supportSectionTitle'),
          supportSectionDescription: t('supportSectionDescription'),
          supportRequiredError: t('supportRequiredError'),
          supportUnsupportedLabel: t('supportUnsupportedLabel'),
          supportUnsupportedHint: t('supportUnsupportedHint'),
          supportSupportedLabel: t('supportSupportedLabel'),
          supportSupportedHint: t('supportSupportedHint'),
          participationCloseoutSectionTitle: t('participationCloseoutSectionTitle'),
          participationCloseoutSectionDescription: t(
            'participationCloseoutSectionDescription',
          ),
          participationCloseoutRequiredError: t('participationCloseoutRequiredError'),
          participationCloseoutAutomaticLabel: t('participationCloseoutAutomaticLabel'),
          participationCloseoutAutomaticHint: t('participationCloseoutAutomaticHint'),
          participationCloseoutManualLabel: t('participationCloseoutManualLabel'),
          participationCloseoutManualHint: t('participationCloseoutManualHint'),
          fulfillmentSectionTitle: t('fulfillmentSectionTitle'),
          fulfillmentRequiredError: t('fulfillmentRequiredError'),
          fulfillmentSilverLabel: t('fulfillmentSilverLabel'),
          fulfillmentSilverHint: t('fulfillmentSilverHint'),
          fulfillmentCraftedLabel: t('fulfillmentCraftedLabel'),
          fulfillmentCraftedHint: t('fulfillmentCraftedHint'),
          advancedSettingsLabel: t('advancedSettingsLabel'),
          advancedSettingsDescription: t('advancedSettingsDescription'),
          rewardsRoleColumn: t('rewardsRoleColumn'),
          rewardsSilverColumn: t('rewardsSilverColumn'),
          rewardsPayoutColumn: t('rewardsPayoutColumn'),
          rewardsSilverHelp: t('rewardsSilverHelp'),
          rewardsPayoutHelp: t('rewardsPayoutHelp'),
          rewardsErrorInvalidSilver: t('rewardsErrorInvalidSilver'),
          rewardsErrorInvalidPayout: t('rewardsErrorInvalidPayout'),
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
