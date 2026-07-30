import { headers } from 'next/headers'
import { getSession, sessionHasAny, type SessionPayload } from '@/lib/session'
import { getSessionGuildId, getTenantDiscordConfig } from '@/lib/tenant'
import { displayNameFromSlug } from '@/lib/tenant-slug'
import { classifyHost } from '@/lib/tenant-resolver'
import { isSuperAdminSession } from '@/lib/super-admin'
import { getSuperAdminPath } from '@/lib/super-admin-path'
import { getAppSetting } from '@/lib/app-settings'
import { getAdminClient } from '@/lib/supabase-admin'
import { isLocale } from '@/i18n/locales'
import { getMarketingPathsForHost } from '@/lib/marketing-paths'
import { canAccessAnyOfficerAdminRoute } from '@/lib/admin-route-access'
import { CAP } from '@/lib/permissions'
import { isMenheraAllianceContentComplianceEnabled } from '@/lib/alliance-content-compliance'
import AppShellClientChrome from './AppShellClientChrome'
import { getRegearSupportConfiguration } from '@/lib/regear-support-server'

// 어떤 tenant 에도 매칭되지 않을 때 표시되는 generic 브랜드명. 과거에 'Menhera'
// 로 하드코딩돼 있었으나 multi-tenant SaaS 가 되면서 다른 길드에 멘헤라 라벨이
// 노출되는 문제 → 제품명으로 대체.
const DEFAULT_BRAND_NAME = 'Albion ZvZ'

export default async function AppShell({
  children,
  allianceEventAllowed = false,
  session: providedSession,
  guildId: providedGuildId,
}: {
  children: React.ReactNode
  allianceEventAllowed?: boolean
  session?: SessionPayload | null
  guildId?: string | null
}) {
  const session = providedSession ?? await getSession()
  let brandName = DEFAULT_BRAND_NAME

  // 세션이 없어도 host 기반으로 brand 추출 — 비로그인 랜딩에서 다른 tenant 의
  // 사이드바를 봐도 그 길드명이 노출되도록.
  const headersList = await headers()
  const classification = classifyHost(headersList.get('host'))
  if (classification.kind === 'tenant') {
    const derived = displayNameFromSlug(classification.slug)
    if (derived.length > 0) brandName = derived
  }

  let craftQueueVisible = false
  // craft_regear_enabled 의 raw 값. 어드민 사이드바 (craft / inventory 탭 가시성)
  // 와 멤버 사이드바 (craft 큐 탭 가시성) 가 모두 이 값에 의존한다.
  let craftAdminVisible = false
  // /craft/orders (멤버용 길드 발주 보드)는 리기어 지원 상태와 별개다. 기존
  // craft_regear_enabled 토글의 노출 동작만 보존하고 is_crafter 는 보지 않는다.
  let craftOrdersVisible = false
  let regearSupported = false
  // 길드원이 자기 길드 공개 프로필 (`/g/<slug>`) 로 이동할 수 있도록 사이드바에
  // 노출할 href. guild_profile_enabled 가 켜진 길드만 — 비활성화된 길드는 어차피
  // 페이지가 404 라 죽은 링크가 된다.
  let publicProfileHref: string | null = null
  let memberTourScope: string | null = null
  let allianceContentComplianceVisible = false
  let uxRefreshEnabled = false
  const visualRefreshEnabled = true
  if (session) {
    const guildId = providedGuildId ?? await getSessionGuildId(session)
    // craft 탭 노출은 어드민/멤버 둘 다 영향. 멤버는 toggle on + is_crafter
    // 또는 admin 일 때만 큐가 보이고, 어드민은 toggle on 하나로 craft 운영 탭이
    // 보인다. 어느 쪽이든 craft_regear_enabled 가 OFF 면 craft 관련 탭은 다 숨김.
    const [
      tenantCfg,
      regearSupport,
      legacyCraftFeatureEnabledRaw,
      isCrafter,
      guildProfileEnabledRaw,
      allianceContentEnabledRaw,
      uxRefreshEnabledRaw,
    ] =
      await Promise.all([
        getTenantDiscordConfig(guildId),
        getRegearSupportConfiguration(guildId),
        getAppSetting('craft_regear_enabled', 'false', guildId),
        session.isMember ? loadIsCrafter(guildId, session.discordId) : Promise.resolve(false),
        getAppSetting('guild_profile_enabled', 'false', guildId),
        getAppSetting('alliance_content_compliance_enabled', 'false', guildId),
        getAppSetting('ux_refresh_v2_enabled', 'false', guildId),
      ])
    if (session.isMember && !session.isGuest && !session.isLocalGuildAccount) {
      memberTourScope = `${guildId}:${session.discordId}`
    }
    // 좌측 상단 표시 이름은 tenant slug 첫 하이픈 앞부분 — onboarding wizard 에서
    // 사용자가 정한 식별자가 그대로 노출된다. session 의 tenant 가 있으면
    // host 기반보다 우선.
    if (tenantCfg?.slug) {
      const derived = displayNameFromSlug(tenantCfg.slug)
      if (derived.length > 0) brandName = derived
      if (guildProfileEnabledRaw === 'true') {
        publicProfileHref = `/g/${tenantCfg.slug}`
      }
    }
    regearSupported = regearSupport.supported
    const craftEnabled =
      regearSupport.supported && regearSupport.fulfillmentMode === 'crafted'
    uxRefreshEnabled = uxRefreshEnabledRaw === 'true'
    allianceContentComplianceVisible = isMenheraAllianceContentComplianceEnabled(
      tenantCfg?.slug,
      allianceContentEnabledRaw,
    ) && (session.isMember || session.isAdmin)
    // 멤버용 craft 큐/내 박스는 is_crafter 가 부여된 경우만 노출. 어드민이라도
    // 본인이 제작자가 아니면 큐를 잡을 일이 없어 사이드바에서 숨긴다 (관리는
    // /admin/dashboard/craft 에서 따로 함). 제작자 권한 없으면 사이드바 깔끔하게.
    craftQueueVisible = craftEnabled && isCrafter
    // 어드민 craft / inventory 탭은 toggle on 인 경우에만 사이드바에 노출.
    // OFF 면 admin 은 settings → events 탭에서 다시 켤 수 있다 (entry 보장).
    craftAdminVisible = craftEnabled && (session.isAdmin || sessionHasAny(session, [
      CAP.CRAFT_TASK_CREATE,
      CAP.CRAFT_TASK_DELIVER,
      CAP.CRAFT_MASTER,
      CAP.INVENTORY_MANAGE,
      CAP.INVENTORY_DELIVER,
    ]))
    // 길드 발주는 regear task 와 별도 도메인이다. 리기어 미지원 전환이 기존
    // guild_order 기능까지 끄지 않도록 종전 raw 토글만 유지한다.
    craftOrdersVisible =
      legacyCraftFeatureEnabledRaw === 'true' &&
      (session.isMember || session.isAdmin)
  }
  const superAdmin = isSuperAdminSession(session)
  // path 는 슈퍼어드민에게만 prop 으로 전달 — 일반 세션 HTML 에는 baked-in 시키지
  // 않아 정찰 표면을 더 줄인다 (env randomized path 를 클라에 노출 안 함).
  const superAdminPath = superAdmin ? getSuperAdminPath() : null
  const canSeeAdminNav = canAccessAnyOfficerAdminRoute(
    session?.isAdmin ?? false,
    session?.capabilities,
  )
  // AGM 공식 마케팅 사이트 진입점 — 호스트별 (canonical / 테넌트 서브도메인) 로
  // 통하는 path 가 다르므로 server 측에서 풀어 사이드바에 prop 으로 전달.
  const seoLocale = headersList.get('x-seo-locale')
  const marketingPaths = getMarketingPathsForHost(
    headersList.get('host'),
    isLocale(seoLocale) ? seoLocale : null,
  )
  const landingHref = marketingPaths.home
  const docsHref = marketingPaths.docs
  const publicBattlesHref = marketingPaths.zvzBattles
  return (
    <AppShellClientChrome
      session={session}
      brandName={brandName}
      isSuperAdmin={superAdmin}
      canSeeAdminNav={canSeeAdminNav}
      superAdminPath={superAdminPath}
      craftQueueVisible={craftQueueVisible}
      craftAdminVisible={craftAdminVisible}
      craftOrdersVisible={craftOrdersVisible}
      regearSupported={regearSupported}
      publicProfileHref={publicProfileHref}
      landingHref={landingHref}
      docsHref={docsHref}
      publicBattlesHref={publicBattlesHref}
      allianceEventAllowed={allianceEventAllowed}
      allianceContentComplianceVisible={allianceContentComplianceVisible}
      memberTourScope={memberTourScope}
      reserveStatusSlot={Boolean(session)}
      uxRefreshEnabled={uxRefreshEnabled}
      visualRefreshEnabled={visualRefreshEnabled}
    >
      {children}
    </AppShellClientChrome>
  )
}

// guild_avatars.is_crafter 직접 조회. craft.ts 의 loadIsCrafter 와 동일 — 'use server'
// 모듈을 client wrapper 인 AppShell 에서 import 하지 않으려 inline 사본을 둔다.
async function loadIsCrafter(guildId: string, discordId: string): Promise<boolean> {
  const db = getAdminClient()
  const { data } = await db
    .from('guild_avatars')
    .select('is_crafter')
    .eq('guild_id', guildId)
    .eq('discord_id', discordId)
    .maybeSingle()
  return (data?.is_crafter as boolean | undefined) === true
}
