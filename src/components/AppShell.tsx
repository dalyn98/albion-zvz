import { headers } from 'next/headers'
import { getSession } from '@/lib/session'
import { getAdminBadgeCounts, type AdminBadgeCounts } from '@/lib/admin-badges'
import { getSessionGuildId, getTenantDiscordConfig } from '@/lib/tenant'
import { displayNameFromSlug } from '@/lib/tenant-slug'
import { classifyHost } from '@/lib/tenant-resolver'
import { isSuperAdminSession } from '@/lib/super-admin'
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

  if (session) {
    const guildId = await getSessionGuildId(session)
    const [badges, tenantCfg] = await Promise.all([
      session.isAdmin ? getAdminBadgeCounts(guildId) : Promise.resolve(null),
      getTenantDiscordConfig(guildId),
    ])
    adminBadges = badges
    // 좌측 상단 표시 이름은 tenant slug 첫 하이픈 앞부분 — onboarding wizard 에서
    // 사용자가 정한 식별자가 그대로 노출된다. session 의 tenant 가 있으면
    // host 기반보다 우선.
    if (tenantCfg?.slug) {
      const derived = displayNameFromSlug(tenantCfg.slug)
      if (derived.length > 0) brandName = derived
    }
  }
  const superAdmin = isSuperAdminSession(session)
  return (
    <div className="flex flex-col lg:flex-row min-h-screen w-full">
      <AppSidebar
        session={session}
        adminBadges={adminBadges}
        brandName={brandName}
        isSuperAdmin={superAdmin}
      />
      <div className="flex-1 min-w-0 flex flex-col">{children}</div>
    </div>
  )
}
