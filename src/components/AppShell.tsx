import { getSession } from '@/lib/session'
import { getAdminBadgeCounts, type AdminBadgeCounts } from '@/lib/admin-badges'
import { getSessionGuildId } from '@/lib/tenant'
import AppSidebar from './AppSidebar'

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  // Only admins see (and pay for) the pending-count queries on every render.
  let adminBadges: AdminBadgeCounts | null = null
  if (session?.isAdmin) {
    const guildId = await getSessionGuildId(session)
    adminBadges = await getAdminBadgeCounts(guildId)
  }
  return (
    <div className="flex flex-col lg:flex-row min-h-screen w-full">
      <AppSidebar session={session} adminBadges={adminBadges} />
      <div className="flex-1 min-w-0 flex flex-col">{children}</div>
    </div>
  )
}
