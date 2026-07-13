import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Video } from 'lucide-react'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { isAllianceContentComplianceAvailable } from '@/lib/alliance-content-compliance-access'
import { getMyAllianceContentCompliance } from '@/lib/alliance-content-compliance-data'
import MyAllianceContentCompliancePanel from '@/components/MyAllianceContentCompliancePanel'

export const dynamic = 'force-dynamic'

export default async function MyAllianceContentCompliancePage() {
  const session = await getSession()
  if (!session) redirect('/api/auth/discord/start?returnTo=/me/content-compliance')
  if (!session.isMember) redirect('/')

  const guildId = await getSessionGuildId(session)
  if (!(await isAllianceContentComplianceAvailable(guildId))) notFound()
  const [t, compliance] = await Promise.all([
    getTranslations('allianceContent'),
    getMyAllianceContentCompliance(guildId, session.discordId),
  ])

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
      <header className="rounded-xl border border-border bg-surface p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-accent-soft p-2 text-accent-soft-foreground"><Video size={21} /></span>
          <div>
            <h1 className="text-xl font-bold text-foreground sm:text-2xl">{t('myTitle')}</h1>
            <p className="mt-1 text-sm text-muted">{t('myDescription')}</p>
          </div>
        </div>
      </header>
      <MyAllianceContentCompliancePanel compliance={compliance} />
    </main>
  )
}
