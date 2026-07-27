import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getSession, sessionHas } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getBattleDetail } from '@/app/actions/battles'
import BattleDetailView from '@/components/BattleDetailView'
import BattlelogPausedPanel from '@/components/BattlelogPausedPanel'
import { getTenantTimezone } from '@/lib/timezone-server'
import { areBattlelogFeaturesPaused } from '@/lib/battlelog-pause'
import { buildLoginEntryHref } from '@/lib/login-entry'
import { CAP } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

interface SearchParams {
  perspective?: string
  event?: string
  fromEvent?: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default async function BattleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<SearchParams>
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams])

  const session = await getSession()
  if (!session) {
    const query = new URLSearchParams()
    if (sp.perspective) query.set('perspective', sp.perspective)
    if (sp.event) query.set('event', sp.event)
    if (sp.fromEvent && UUID_RE.test(sp.fromEvent)) query.set('fromEvent', sp.fromEvent)
    const returnTo = query.size > 0
      ? `/battles/${id}?${query.toString()}`
      : `/battles/${id}`
    redirect(buildLoginEntryHref({ returnTo }))
  }

  if (areBattlelogFeaturesPaused()) {
    const tPaused = await getTranslations('battleTracking')
    return (
      <main className="flex-1 w-full max-w-3xl xl:max-w-6xl mx-auto px-4 py-6 sm:py-8">
        <BattlelogPausedPanel
          eyebrow={tPaused('pausedEyebrow')}
          title={tPaused('pausedTitle')}
          body={tPaused('pausedBody')}
          detail={tPaused('pausedDetail')}
        />
      </main>
    )
  }

  const guildId = await getSessionGuildId(session)
  const [{ detail, error }, t, tenantTimezone] = await Promise.all([
    getBattleDetail(id, sp.perspective),
    getTranslations('battleDetail'),
    getTenantTimezone(guildId),
  ])
  if (!detail && !error) notFound()

  // 자기 시점일 때만 base url 로 돌아가는 링크. cross 보기 시엔 self 로 돌아가는
  // 링크가 더 의미 있으므로 ArrowLeft 가 perspective 를 떼고 같은 id 로 향한다.
  const sourceEventId = sp.fromEvent && UUID_RE.test(sp.fromEvent) ? sp.fromEvent : null
  const backHref = sourceEventId
    ? `/events/${sourceEventId}/report`
    : detail?.perspectiveKind === 'cross'
      ? `/battles/${id}`
      : '/battles'
  const backLabel = sourceEventId
    ? t('backToEventReport')
    : detail?.perspectiveKind === 'cross'
      ? t('backToSelf')
      : t('backToList')

  return (
    <main className="flex-1 w-full max-w-3xl xl:max-w-6xl mx-auto px-4 py-6 sm:py-8 space-y-5">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-gray-400 hover:text-white text-xs"
      >
        <ArrowLeft size={13} />
        {backLabel}
      </Link>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {detail && (
        <BattleDetailView
          detail={detail}
          battleId={id}
          timezone={tenantTimezone}
          highlightedEventId={sp.event}
          canManageBattle={sessionHas(session, CAP.BATTLES_MANAGE)}
        />
      )}
    </main>
  )
}
