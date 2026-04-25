import { getSession } from '@/lib/session'
import { getAdminBadgeCounts, type AdminBadgeCounts } from '@/lib/admin-badges'
import { getSessionGuildId, getTenantDiscordConfig } from '@/lib/tenant'
import { displayNameFromSlug } from '@/lib/tenant-slug'
import AppSidebar from './AppSidebar'

const DEFAULT_BRAND_NAME = 'Menhera'

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  // Only admins see (and pay for) the pending-count queries on every render.
  let adminBadges: AdminBadgeCounts | null = null
  let brandName = DEFAULT_BRAND_NAME
  if (session) {
    const guildId = await getSessionGuildId(session)
    const [badges, tenantCfg] = await Promise.all([
      session.isAdmin ? getAdminBadgeCounts(guildId) : Promise.resolve(null),
      getTenantDiscordConfig(guildId),
    ])
    adminBadges = badges
    // 좌측 상단 표시 이름은 tenant slug 첫 하이픈 앞부분 — onboarding wizard 에서
    // 사용자가 정한 식별자가 그대로 노출된다. slug 가 없거나 (legacy 세션)
    // 파싱 실패하면 기본값 "Menhera" 로 폴백.
    if (tenantCfg?.slug) {
      const derived = displayNameFromSlug(tenantCfg.slug)
      if (derived.length > 0) brandName = derived
    }
  }
  return (
    <div className="flex flex-col lg:flex-row min-h-screen w-full">
      <AppSidebar session={session} adminBadges={adminBadges} brandName={brandName} />
      <div className="flex-1 min-w-0 flex flex-col">{children}</div>
    </div>
  )
}
