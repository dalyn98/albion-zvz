import { getFirstAccessibleAdminPath } from '@/lib/admin-route-access'
import { getSession } from '@/lib/session'
import AccessDeniedState from '@/components/AccessDeniedState'
import { getTranslations } from 'next-intl/server'

export const dynamic = 'force-dynamic'

export default async function AdminAccessDeniedPage() {
  const [session, t] = await Promise.all([
    getSession(),
    getTranslations('accessDenied'),
  ])
  const primaryHref = getFirstAccessibleAdminPath(
    session?.isAdmin ?? false,
    session?.capabilities,
  ) ?? '/'

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:py-12">
      <AccessDeniedState
        primaryHref={primaryHref}
        primaryLabel={primaryHref === '/' ? t('backHome') : t('backToAccessible')}
      />
    </main>
  )
}
