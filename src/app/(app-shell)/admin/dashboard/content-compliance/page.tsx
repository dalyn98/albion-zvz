import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { ShieldCheck } from 'lucide-react'
import { getSession, sessionHas } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { CAP } from '@/lib/permissions'
import { isAllianceContentComplianceAvailable } from '@/lib/alliance-content-compliance-access'
import { getAllianceContentAdminDashboard } from '@/lib/alliance-content-compliance-data'
import AllianceContentComplianceAdminPanel from '@/components/AllianceContentComplianceAdminPanel'

export const dynamic = 'force-dynamic'

export default async function AllianceContentComplianceAdminPage() {
  const session = await getSession()
  if (!session) redirect('/login?returnTo=%2Fadmin%2Fdashboard%2Fcontent-compliance')
  if (!session.isAdmin && !sessionHas(session, CAP.STATS_VIEW)) redirect('/admin/dashboard')

  const guildId = await getSessionGuildId(session)
  if (!(await isAllianceContentComplianceAvailable(guildId))) notFound()

  const [t, dashboard] = await Promise.all([
    getTranslations('allianceContent'),
    getAllianceContentAdminDashboard(guildId),
  ])

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="rounded-xl border border-border bg-surface p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-accent-soft p-2 text-accent-soft-foreground"><ShieldCheck size={21} /></span>
          <div>
            <h1 className="text-xl font-bold text-foreground sm:text-2xl">{t('adminTitle')}</h1>
            <p className="mt-1 text-sm text-muted">{t('adminDescription')}</p>
          </div>
        </div>
      </header>
      <AllianceContentComplianceAdminPanel dashboard={dashboard} />
    </main>
  )
}
