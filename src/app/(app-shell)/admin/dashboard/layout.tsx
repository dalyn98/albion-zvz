import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { canAccessAdminPath } from '@/lib/admin-route-access'
import { getSession } from '@/lib/session'
import ScopedIntlProvider from '@/components/ScopedIntlProvider'
import { APP_ROUTE_CLIENT_MESSAGE_NAMESPACES } from '@/lib/client-messages'

export const dynamic = 'force-dynamic'

async function requireDashboardAccess(): Promise<void> {
  const session = await getSession()
  if (!session) redirect('/admin')

  const headersList = await headers()
  const pathname = headersList.get('x-pathname')
  if (!pathname) {
    if (session.isAdmin) return
    redirect('/admin/access-denied')
  }
  if (!canAccessAdminPath(pathname, session.isAdmin, session.capabilities)) {
    redirect(`/admin/access-denied?returnTo=${encodeURIComponent(pathname)}`)
  }
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardAccess()

  return (
    <ScopedIntlProvider namespaces={APP_ROUTE_CLIENT_MESSAGE_NAMESPACES.admin}>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8 xl:max-w-7xl 2xl:max-w-[1600px]">
        {children}
      </main>
    </ScopedIntlProvider>
  )
}
