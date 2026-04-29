import { headers } from 'next/headers'
import { getSession } from '@/lib/session'
import { getAdminBadgeCounts, type AdminBadgeCounts } from '@/lib/admin-badges'
import { getSessionGuildId, getTenantDiscordConfig } from '@/lib/tenant'
import { displayNameFromSlug } from '@/lib/tenant-slug'
import { classifyHost } from '@/lib/tenant-resolver'
import { isSuperAdminSession } from '@/lib/super-admin'
import { getSuperAdminPath } from '@/lib/super-admin-path'
import { getAppSetting } from '@/lib/app-settings'
import { getAdminClient } from '@/lib/supabase-admin'
import AppSidebar from './AppSidebar'

// 어떤 tenant 에도 매칭되지 않을 때 표시되는 generic 브랜드명. 과거에 'Menhera'
// 로 하드코딩돼 있었으나 multi-tenant SaaS 가 되면서 다른 길드에 멘헤라 라벨이
// 노출되는 문제 → 제품명으로 대체.
const DEFAULT_BRAND_NAME = 'Albion ZvZ'

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  // Only admins see (and pay for) the pending-count queries on every render.
  let adminBadges: AdminBadgeCounts | null = null
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
  // 길드원이 자기 길드 공개 프로필 (`/g/<slug>`) 로 이동할 수 있도록 사이드바에
  // 노출할 href. guild_profile_enabled 가 켜진 길드만 — 비활성화된 길드는 어차피
  // 페이지가 404 라 죽은 링크가 된다.
  let publicProfileHref: string | null = null
  if (session) {
    const guildId = await getSessionGuildId(session)
    const [badges, tenantCfg, craftEnabledRaw, isCrafter, guildProfileEnabledRaw] =
      await Promise.all([
        session.isAdmin ? getAdminBadgeCounts(guildId) : Promise.resolve(null),
        getTenantDiscordConfig(guildId),
        session.isMember
          ? getAppSetting('craft_regear_enabled', 'false', guildId)
          : Promise.resolve('false'),
        session.isMember ? loadIsCrafter(guildId, session.discordId) : Promise.resolve(false),
        getAppSetting('guild_profile_enabled', 'false', guildId),
      ])
    adminBadges = badges
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
    craftQueueVisible = craftEnabledRaw === 'true' && (isCrafter || session.isAdmin)
  }
  const superAdmin = isSuperAdminSession(session)
  // path 는 슈퍼어드민에게만 prop 으로 전달 — 일반 세션 HTML 에는 baked-in 시키지
  // 않아 정찰 표면을 더 줄인다 (env randomized path 를 클라에 노출 안 함).
  const superAdminPath = superAdmin ? getSuperAdminPath() : null
  return (
    <div className="flex flex-col lg:flex-row min-h-screen w-full">
      <AppSidebar
        session={session}
        adminBadges={adminBadges}
        brandName={brandName}
        isSuperAdmin={superAdmin}
        superAdminPath={superAdminPath}
        craftQueueVisible={craftQueueVisible}
        publicProfileHref={publicProfileHref}
      />
      <div className="flex-1 min-w-0 flex flex-col">{children}</div>
    </div>
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
