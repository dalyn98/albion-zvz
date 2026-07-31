import Link from 'next/link'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { notFound, redirect } from 'next/navigation'
import TacticViewer from '@/components/tactics/TacticViewer'
import { loadEventTacticSnapshot } from '@/lib/event-operations-server'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { sessionCanViewTactics } from '@/lib/tactics/access'
import { getTenantTimezone } from '@/lib/timezone-server'
import { formatDateTimeShort } from '@/lib/format-datetime'
import { isTacticsExperimentalEnabled } from '@/lib/tactics/feature-server'

export const dynamic = 'force-dynamic'

export default async function EventTacticSnapshotPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const [{ id }, session, t] = await Promise.all([
    params,
    getSession(),
    getTranslations('eventOperations'),
  ])
  if (!session) redirect('/')
  if (!sessionCanViewTactics(session)) redirect(`/events/${id}`)
  const guildId = await getSessionGuildId(session)
  if (!(await isTacticsExperimentalEnabled(guildId))) redirect(`/events/${id}`)
  const [snapshot, tenantTimezone] = await Promise.all([
    loadEventTacticSnapshot(guildId, id),
    getTenantTimezone(guildId),
  ])
  if (!snapshot) notFound()

  return (
    <main className="flex-1 px-4 py-6 sm:py-8 max-w-6xl mx-auto w-full space-y-4">
      <Link
        href={`/events/${id}`}
        className="inline-flex items-center gap-1 text-sm text-gray-400 transition-colors hover:text-white"
      >
        <ArrowLeft size={14} />
        {t('backToEvent')}
      </Link>
      <div className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.08] px-4 py-3">
        <ShieldCheck size={17} className="mt-0.5 shrink-0 text-emerald-300" />
        <div>
          <p className="text-sm font-bold text-emerald-100">{t('snapshotBadge')}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-gray-400">
            {t('snapshotDescription', {
              date: formatDateTimeShort(snapshot.capturedAt, tenantTimezone),
            })}
          </p>
        </div>
      </div>
      <TacticViewer document={snapshot.document} showAdminLink={false} />
    </main>
  )
}
