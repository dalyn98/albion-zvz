import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import TenantRewardsSetupForm from '@/components/TenantRewardsSetupForm'
import { SLOT_ROLES } from '@/types'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

// 위저드 3단계 (최종): 역할별 기본 리기어 실버. 세션/소유권 검증은 상위 레이아웃
// 담당. bot-callback 이 tenant 생성 시 SLOT_ROLES 를 silver=0 으로 seed 해놓았으
// 므로 여기서는 그 값을 읽어 폼 초기값으로 넘긴다. 실패하거나 행이 없으면
// SLOT_ROLES 에서 기본 틀만 만들어 보여준다 (saveTenantRewards 는 upsert).
export default async function TenantRewardsSetupPage({ params }: Props) {
  const { id } = await params
  const t = await getTranslations('onboard')

  const db = getAdminClient()
  const { data: rows } = await db
    .from('role_rewards')
    .select('role_name, silver')
    .eq('guild_id', id)
    .order('role_name')

  const existing = new Map<string, number>()
  for (const r of (rows ?? []) as Array<{ role_name: string; silver: number }>) {
    existing.set(r.role_name, Number.isFinite(r.silver) ? r.silver : 0)
  }
  const initial = SLOT_ROLES.map((role_name) => ({
    role_name,
    silver: existing.get(role_name) ?? 0,
  }))

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
        labels={{
          rewardsRoleColumn: t('rewardsRoleColumn'),
          rewardsSilverColumn: t('rewardsSilverColumn'),
          rewardsSilverHelp: t('rewardsSilverHelp'),
          rewardsErrorInvalidSilver: t('rewardsErrorInvalidSilver'),
          finishButton: t('finishButton'),
          finishingButton: t('finishingButton'),
          errorGeneric: t('errorGeneric'),
        }}
      />
    </>
  )
}
