import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSession, sessionHas } from '@/lib/session'
import { getAdminClient } from '@/lib/supabase-admin'
import { tenantUrl } from '@/lib/tenant-resolver'
import OnboardStartGuide from '@/components/OnboardStartGuide'
import OnboardWizardProgress from '@/components/OnboardWizardProgress'
import WorkspaceLifecycleCard from '@/components/WorkspaceLifecycleCard'
import { CAP } from '@/lib/permissions'
import {
  isRecentDiscordAuthentication,
  loadTenantLifecycleState,
  resolveTenantLifecycleAuthorization,
} from '@/lib/tenant-lifecycle'

export const dynamic = 'force-dynamic'

interface LayoutProps {
  children: React.ReactNode
  params: Promise<{ id: string }>
}

// 모든 온보딩 위저드 페이지 (/onboard/setup/[id]/*) 공통 레이아웃. 세션과 tenant
// 소유권을 한 곳에서 검증하고 상단에 공유 progress 인디케이터를 렌더한다. 각
// 페이지는 본인만의 form/콘텐츠에 집중한다.
export default async function OnboardSetupLayout({ children, params }: LayoutProps) {
  const { id } = await params
  const session = await getSession()
  if (!session) {
    redirect(`/login?returnTo=${encodeURIComponent(`/onboard/setup/${id}`)}`)
  }

  const db = getAdminClient()
  const { data: tenant } = await db
    .from('tenants')
    .select(
      'id, name, slug, status, lifecycle_reason, created_by_discord_id',
    )
    .eq('id', id)
    .maybeSingle()
  if (!tenant) {
    redirect('/onboard')
  }

  const t = await getTranslations('onboard')
  const requiresLifecycleRecovery =
    tenant.status === 'deletion_pending' ||
    (
      tenant.status === 'suspended' &&
      ['policy', 'billing', 'inactive'].includes(
        String(tenant.lifecycle_reason ?? ''),
      )
    )

  if (requiresLifecycleRecovery) {
    const authorization = await resolveTenantLifecycleAuthorization(
      id,
      session,
    )
    if (
      !authorization ||
      !sessionHas(authorization.session, CAP.WORKSPACE_DELETE)
    ) {
      redirect('/onboard')
    }
    const lifecycle = await loadTenantLifecycleState(id)
    if (!lifecycle) redirect('/onboard')
    return (
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-10 sm:py-14">
        <div className="mb-5 space-y-2">
          <h1 className="text-2xl font-bold text-white">
            {lifecycle.guildName}
          </h1>
          <p className="text-sm text-gray-400">
            {lifecycle.status === 'deletion_pending'
              ? t('lifecycleRecoveryDescription')
              : t('lifecycleSuspendedDescription')}
          </p>
        </div>
        <WorkspaceLifecycleCard
          state={lifecycle}
          recentlyAuthenticated={isRecentDiscordAuthentication(
            authorization.session.authenticatedAt,
          )}
          recoveryOnly
        />
      </main>
    )
  }

  if (tenant.created_by_discord_id !== session.discordId) {
    redirect('/onboard')
  }

  return (
    <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-10 sm:py-14">
      <OnboardStartGuide
        tenantId={id}
        eyebrow={t('startGuideEyebrow')}
        title={t('startGuideTitle')}
        description={t('startGuideDescription')}
        currentStepLabel={t('startGuideCurrentLabel')}
        roadmapLabel={t('startGuideRoadmapLabel')}
        afterSetupLabel={t('startGuideAfterLabel')}
        statusLabels={{
          done: t('startGuideDoneLabel'),
          active: t('startGuideActiveLabel'),
          upcoming: t('startGuideUpcomingLabel'),
        }}
        steps={[
          {
            title: t('startGuideStep1Title'),
            body: t('startGuideStep1Body'),
          },
          {
            title: t('startGuideStep2Title'),
            body: t('startGuideStep2Body'),
          },
          {
            title: t('startGuideStep3Title'),
            body: t('startGuideStep3Body'),
          },
        ]}
        afterItems={[
          {
            title: t('startGuideAfterInviteTitle'),
            body: t('startGuideAfterInviteBody'),
          },
          {
            title: t('startGuideAfterEventTitle'),
            body: t('startGuideAfterEventBody'),
          },
          {
            title: t('startGuideAfterGuideTitle'),
            body: t('startGuideAfterGuideBody'),
          },
        ]}
        pageCreation={{
          title: t('siteCreationTitle', { name: tenant.name as string }),
          description: t('siteCreationDescription'),
          statusLabel: t('siteCreationStatusLabel'),
          statusValue:
            tenant.status === 'active'
              ? t('siteCreationStatusActive')
              : t('siteCreationStatusPending'),
          addressLabel: t('siteCreationAddressLabel'),
          address: tenantUrl(tenant.slug as string, '/'),
          visibilityLabel: t('siteCreationVisibilityLabel'),
          visibilityValue:
            tenant.status === 'active'
              ? t('siteCreationVisibilityActive')
              : t('siteCreationVisibilityHidden'),
        }}
      />
      <OnboardWizardProgress
        tenantId={id}
        labels={[t('step1Label'), t('step2Label'), t('step3Label')]}
      />
      {children}
    </main>
  )
}
