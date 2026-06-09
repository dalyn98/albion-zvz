import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getAdminClient } from '@/lib/supabase-admin'
import { tenantUrl } from '@/lib/tenant-resolver'
import OnboardStartGuide from '@/components/OnboardStartGuide'
import OnboardWizardProgress from '@/components/OnboardWizardProgress'

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
    redirect(`/api/auth/discord/start?returnTo=${encodeURIComponent(`/onboard/setup/${id}`)}`)
  }

  const db = getAdminClient()
  const { data: tenant } = await db
    .from('tenants')
    .select('id, name, slug, status, created_by_discord_id')
    .eq('id', id)
    .maybeSingle()
  if (!tenant || tenant.created_by_discord_id !== session.discordId) {
    redirect('/onboard')
  }

  const t = await getTranslations('onboard')

  return (
    <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-10 sm:py-14">
      <OnboardStartGuide
        tenantId={id}
        eyebrow={t('startGuideEyebrow')}
        title={t('startGuideTitle')}
        description={t('startGuideDescription')}
        currentStepLabel={t('startGuideCurrentLabel')}
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
