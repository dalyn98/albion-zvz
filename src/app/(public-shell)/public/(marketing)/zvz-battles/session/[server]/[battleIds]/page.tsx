import type { Metadata } from 'next'
import { Layers3 } from 'lucide-react'
import { notFound } from 'next/navigation'
import PublicZvzBattleSessionCard from '@/components/PublicZvzBattleSessionCard'
import { isAlbionServer } from '@/lib/albion-gameinfo'
import { getMarketingPathsForEnvironment } from '@/lib/marketing-paths'
import {
  getMarketingLocale,
  getMarketingTranslator,
} from '@/lib/marketing-static-intl'
import { groupPublicZvzBattleSessions } from '@/lib/public-zvz-battle-sessions'
import { loadPublicBattlesByAlbionIds } from '@/lib/public-zvz-battles'
import { normalizePublicZvzBattleIds } from '@/lib/public-zvz-record-links'
import { getUtcWeekStartDateString } from '@/lib/public-battlelog-sync'
import {
  PublicZvzRecordChrome,
  PublicZvzRecordHeader,
} from '../../../record-ui'

export const dynamic = 'force-dynamic'

interface SessionPageProps {
  params: Promise<{ server: string; battleIds: string }>
}

async function loadSession(route: { server: string; battleIds: string }) {
  if (!isAlbionServer(route.server)) return null
  const battleIds = normalizePublicZvzBattleIds(route.battleIds)
  if (battleIds.length === 0) return null
  const battles = await loadPublicBattlesByAlbionIds({ server: route.server, battleIds })
  const sessions = groupPublicZvzBattleSessions(battles)
  return sessions.find((session) => (
    session.battleIds.length === battleIds.length &&
    battleIds.every((battleId) => session.battleIds.includes(battleId))
  )) ?? null
}

export async function generateMetadata({ params }: SessionPageProps): Promise<Metadata> {
  const [route, t] = await Promise.all([
    params,
    getMarketingTranslator('publicZvzSession'),
  ])
  const session = await loadSession(route).catch(() => null)
  if (!session) return { title: t('metaFallbackTitle'), robots: { index: false, follow: false } }
  const primary = session.topForces[0]
  const secondary = session.topForces[1]
  const title = primary && secondary
    ? `${primary.forceName} vs ${secondary.forceName} · AGM Battles`
    : t('metaFallbackTitle')
  const description = t('metaDescription', {
    count: session.battleCount,
    minutes: session.durationMinutes,
    kills: session.totalKills,
  })
  return {
    title,
    description,
    robots: { index: false, follow: true },
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function PublicZvzBattleSessionPage({ params }: SessionPageProps) {
  const [route, locale, t, boardT] = await Promise.all([
    params,
    getMarketingLocale(),
    getMarketingTranslator('publicZvzSession'),
    getMarketingTranslator('publicZvzBattles'),
  ])
  const session = await loadSession(route)
  if (!session) notFound()
  const paths = getMarketingPathsForEnvironment(locale)
  const weekStart = getUtcWeekStartDateString(new Date(session.startedAt))
  const primary = session.topForces[0]
  const secondary = session.topForces[1]
  const title = primary && secondary
    ? `${primary.forceName} vs ${secondary.forceName}`
    : t('fallbackTitle')

  return (
    <PublicZvzRecordChrome>
      <PublicZvzRecordHeader
        boardHref={`${paths.zvzBattles}?server=${session.server}&view=battles`}
        backLabel={t('backToBattles')}
        eyebrow={t('eyebrow')}
        title={title}
        subtitle={t('subtitle', {
          server: boardT(`server_${session.server}`),
          count: session.battleCount,
          minutes: session.durationMinutes,
        })}
        badges={
          <span className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-amber-300/10 px-2.5 text-xs font-bold text-amber-200">
            <Layers3 size={13} aria-hidden="true" />
            {t('sessionBadge')}
          </span>
        }
      />

      <section className="mt-7">
        <PublicZvzBattleSessionCard
          session={session}
          basePath={paths.zvzBattles}
          weekStart={weekStart}
          locale={locale}
          labels={{
            official: boardT('agmZvzBadge'),
            publicBattle: t('publicBattle'),
            session: t('sessionBadge'),
            logsAndDuration: t('logsAndDuration', { count: '{count}', minutes: '{minutes}' }),
            peakPlayers: t('peakPlayers'),
            totalKills: boardT('killsMetric'),
            totalFame: boardT('fameMetric'),
            people: boardT('peopleCount', { count: '{count}' }),
            kd: boardT('kdColumn'),
            versus: boardT('versusLabel'),
            additionalForces: boardT('additionalForces', { count: '{count}' }),
            topGuilds: boardT('topGuildsTitle'),
            otherGuilds: t('otherGuilds'),
            rawLogs: t('rawLogs', { count: '{count}' }),
            battleId: boardT('battleId', { id: '{id}' }),
            viewSession: t('viewSession'),
            share: t('share'),
            copied: t('copied'),
          }}
        />
      </section>
    </PublicZvzRecordChrome>
  )
}
