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
    redirect('/admin?error=not_admin')
  }
  if (!canAccessAdminPath(pathname, session.isAdmin, session.capabilities)) {
    redirect('/admin?error=not_admin')
  }
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardAccess()

  return (
    <ScopedIntlProvider namespaces={APP_ROUTE_CLIENT_MESSAGE_NAMESPACES.admin}>
      <main className="flex-1 px-4 py-6 sm:py-8 max-w-5xl xl:max-w-7xl mx-auto w-full">
        {children}
      </main>
    </ScopedIntlProvider>
  )
}
