import Link from 'next/link'
import { Suspense } from 'react'
import { ArrowRight } from 'lucide-react'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { after } from 'next/server'
import { getSession } from '@/lib/session'
import { getSessionGuildId, getTenantDiscordConfig } from '@/lib/tenant'
import { buildTenantHostUrl } from '@/lib/tenant-resolver'
import OnboardCompletionBanner from '@/components/OnboardCompletionBanner'
import AdminOperationsPanel from '@/components/AdminOperationsPanel'
import AdminFirstRunPanel from '@/components/AdminFirstRunPanel'
import AdminOnboardingProgressCard from '@/components/AdminOnboardingProgressCard'
import { PageHeader, SituationSurface, cx, pressScaleClass } from '@/components/ui-patterns'
import { resolveAdminEventWorkspaceSection } from '@/lib/app-workspaces'
import {
  isTenantLaunchPlanActive,
  loadTenantOnboardingSummary,
  logTenantOnboardingEventOnce,
} from '@/lib/tenant-onboarding-events'
interface SearchParams {
  section?: string
  onboarded?: string
}

// Never prerender at build — both tabs read DB state that changes as admins
// create/delete events or templates. Serving a build-time snapshot would ship
// links to already-deleted rows.
export const dynamic = 'force-dynamic'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const showOnboardedBanner = sp.onboarded === '1'

  // 기존 북마크(`/admin/dashboard?section=...`)는 새 이벤트 작업공간으로
  // 정규화한다. 콘텐츠와 사이드바의 활성 메뉴가 같은 URL 을 가리키도록
  // 인라인 렌더링 대신 canonical 작업공간으로 이동한다.
  if (sp.section) {
    const section = resolveAdminEventWorkspaceSection(sp.section)
    redirect(`/admin/dashboard/events?section=${section}`)
  }

  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  const guildId = await getSessionGuildId(session)

  const [tDashboard, tOnboard] = await Promise.all([
    getTranslations('adminDashboard'),
    getTranslations('onboard'),
  ])

  return (
    <div className="space-y-6">
      {showOnboardedBanner && (
        <OnboardCompletionBanner
          title={tOnboard('completionBannerTitle')}
          description={tOnboard('completionBannerDescription')}
          linkLabel={tOnboard('completionBannerLink')}
          guideLinkLabel={tOnboard('completionBannerGuideLink')}
          dismissLabel={tOnboard('completionBannerDismiss')}
        />
      )}

      <PageHeader
        eyebrow={tDashboard('commandCenterEyebrow')}
        title={tDashboard('commandCenterTitle')}
        description={tDashboard('commandCenterDescription')}
        actions={
          <Link
            href="/admin/dashboard/events"
            className={cx(
              'inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground shadow-card transition-[border-color,background-color,transform] duration-200 ease-out hover:border-accent/50 hover:bg-surface-2',
              pressScaleClass,
            )}
          >
            {tDashboard('openEventWorkspace')}
            <ArrowRight size={15} />
          </Link>
        }
      />

      <Suspense fallback={<DashboardReadinessSkeleton />}>
        <DashboardReadinessSection
          guildId={guildId}
          actorDiscordId={session.discordId}
        />
      </Suspense>
    </div>
  )
}

async function DashboardReadinessSection({
  guildId,
  actorDiscordId,
}: {
  guildId: string
  actorDiscordId: string
}) {
  after(async () => {
    await logTenantOnboardingEventOnce({
      guildId,
      actorDiscordId,
      eventType: 'admin_dashboard_viewed',
      details: { path: '/admin/dashboard' },
    })
  })

  const [tenantConfig, onboardingSummary] = await Promise.all([
    getTenantDiscordConfig(guildId),
    loadTenantOnboardingSummary(guildId),
  ])

  // 초대 링크는 /onboarding/albion 으로 보낸다 — 신규 길드원이 Discord 로그인
  // + 알비온 닉네임 인증을 한 번에 끝낼 수 있도록. 이미 인증된 사람이 다시 눌러도
  // 위저드가 'done' 단계로 진입해 짧게 확인 후 /me 로 빠져나간다.
  const inviteUrl = tenantConfig
    ? buildTenantHostUrl(tenantConfig.slug, '/onboarding/albion')
    : null
  const inviteGuildName = tenantConfig?.name ?? ''
  const launchPlanActive = isTenantLaunchPlanActive(onboardingSummary)

  return (
    <>
      {launchPlanActive && (
        <AdminOnboardingProgressCard summary={onboardingSummary}>
          <AdminFirstRunPanel
            embedded
            inviteUrl={inviteUrl}
            guildName={inviteGuildName}
            canSendDiscordTest={
              tenantConfig?.botInstalled === true &&
              !!tenantConfig.eventChannelId
            }
            newEventHref="/admin/dashboard/events/new"
            guideHref="/admin/dashboard/guide"
            settingsHref="/admin/dashboard/settings?tab=events"
          />
        </AdminOnboardingProgressCard>
      )}

      <SituationSurface>
        <AdminOperationsPanel guildId={guildId} />
      </SituationSurface>
    </>
  )
}

function DashboardReadinessSkeleton() {
  return (
    <div className="grid gap-3">
      <div className="h-24 rounded-xl border border-border bg-surface/70 shadow-card" />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="h-28 rounded-xl border border-border bg-surface/60 shadow-card" />
        <div className="h-28 rounded-xl border border-border bg-surface/60 shadow-card" />
        <div className="h-28 rounded-xl border border-border bg-surface/60 shadow-card" />
        <div className="h-28 rounded-xl border border-border bg-surface/60 shadow-card" />
      </div>
    </div>
  )
}
