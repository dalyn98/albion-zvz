import type { Metadata } from 'next'
import { ArrowLeft, Scale, ShieldAlert, Swords } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import {
  PublicZvzFavoriteButton,
  type PublicZvzFavoriteEntity,
} from '@/components/PublicZvzEngagementClient'
import PublicZvzShareButton from '@/components/PublicZvzShareButton'
import { isAlbionServer, type AlbionServer } from '@/lib/albion-gameinfo'
import { getMarketingPathsForEnvironment } from '@/lib/marketing-paths'
import {
  getMarketingLocale,
  getMarketingTranslator,
} from '@/lib/marketing-static-intl'
import {
  buildPublicZvzHeadToHead,
  type PublicZvzInsightEvidence,
} from '@/lib/public-zvz-insights'
import {
  buildPublicZvzAllianceRecordHref,
  buildPublicZvzGuildRecordHref,
  normalizePublicZvzAlbionId,
  normalizePublicZvzDate,
  normalizePublicZvzSeasonId,
} from '@/lib/public-zvz-record-links'
import {
  normalizePublicZvzRankingEntityKind,
  normalizePublicZvzRankingScope,
  type PublicZvzRankingEntityKind,
  type PublicZvzRankingScope,
} from '@/lib/public-zvz-ranking-v2'
import {
  loadPublicZvzV2EntityRecord,
  type PublicZvzV2EntityEvidence,
  type PublicZvzV2EntityRecord,
  type PublicZvzV2Ranking,
} from '@/lib/public-zvz-ranking-v2-data'
import {
  formatPublicZvzCompact,
  formatPublicZvzDecimal,
  formatPublicZvzNumber,
  PublicZvzKdScore,
  PublicZvzRecordChrome,
  PublicZvzRecordHeader,
} from '../record-ui'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMarketingTranslator('publicZvzCompare')
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    robots: { index: false, follow: true },
  }
}

interface ComparePageProps {
  searchParams: Promise<{
    server?: string | string[]
    entity?: string | string[]
    left?: string | string[]
    right?: string | string[]
    scope?: string | string[]
    season?: string | string[]
    asOf?: string | string[]
  }>
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function insightEvidence(row: PublicZvzV2EntityEvidence): PublicZvzInsightEvidence {
  return {
    battleRecordId: row.battleRecordId,
    engagementId: row.engagementId,
    startedAt: row.startedAt,
    teamSize: row.ownTeamSize,
    kills: row.kills,
    deaths: row.deaths,
    killFame: row.killFame,
    engagementScale: row.scale,
    engagementResult: row.result,
    opponents: row.opponents.map((opponent) => ({
      forceKey: opponent.forceKey,
      forceKind: opponent.forceKind,
      forceName: opponent.name,
      allianceAlbionId: opponent.allianceId,
      guildAlbionId: opponent.forceKind === 'guild' ? opponent.albionId : null,
      teamSize: opponent.teamSize,
      kills: opponent.kills,
      deaths: opponent.deaths,
      killFame: opponent.killFame,
      hasScoreEvidence: opponent.role === 'result_eligible',
    })),
  }
}

function entityHref(input: {
  basePath: string
  server: AlbionServer
  entityKind: PublicZvzRankingEntityKind
  entityId: string
  seasonId: string
  asOfDate: string
  scope: PublicZvzRankingScope
}): string {
  return input.entityKind === 'guild'
    ? buildPublicZvzGuildRecordHref({
        basePath: input.basePath,
        server: input.server,
        guildAlbionId: input.entityId,
        seasonId: input.seasonId,
        asOfDate: input.asOfDate,
      })
    : buildPublicZvzAllianceRecordHref({
        basePath: input.basePath,
        server: input.server,
        allianceAlbionId: input.entityId,
        seasonId: input.seasonId,
        asOfDate: input.asOfDate,
        scale: input.scope === 'overall' ? null : input.scope,
      })
}

function favoriteEntity(input: {
  row: PublicZvzV2Ranking
  href: string
}): PublicZvzFavoriteEntity {
  return {
    server: input.row.server,
    entityKind: input.row.entityKind,
    entityId: input.row.entityAlbionId,
    entityName: input.row.entityName,
    href: input.href,
  }
}

function ComparisonValue({
  label,
  left,
  right,
}: {
  label: string
  left: ReactNode
  right: ReactNode
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_7rem_minmax(0,1fr)] items-center gap-3 border-b border-white/[0.07] py-3 last:border-b-0">
      <div className="text-right tabular-nums text-base font-black text-sky-100">{left}</div>
      <div className="text-center text-[11px] font-semibold text-gray-500">{label}</div>
      <div className="tabular-nums text-base font-black text-rose-100">{right}</div>
    </div>
  )
}

function recordRollup(
  record: PublicZvzV2EntityRecord,
  scope: PublicZvzRankingScope,
): PublicZvzV2Ranking | null {
  return record.rollups[scope] ?? null
}

export default async function PublicZvzComparePage({ searchParams }: ComparePageProps) {
  const [query, locale, t, boardT, recordT] = await Promise.all([
    searchParams,
    getMarketingLocale(),
    getMarketingTranslator('publicZvzCompare'),
    getMarketingTranslator('publicZvzBattles'),
    getMarketingTranslator('publicZvzRecords'),
  ])
  const serverValue = firstParam(query.server)
  const leftId = normalizePublicZvzAlbionId(firstParam(query.left))
  const rightId = normalizePublicZvzAlbionId(firstParam(query.right))
  if (!serverValue || !isAlbionServer(serverValue) || !leftId || !rightId || leftId === rightId) {
    notFound()
  }
  const server = serverValue
  const entityKind = normalizePublicZvzRankingEntityKind(firstParam(query.entity))
  const scope = normalizePublicZvzRankingScope(firstParam(query.scope))
  const seasonId = normalizePublicZvzSeasonId(firstParam(query.season))
  const asOfDate = normalizePublicZvzDate(firstParam(query.asOf))
  const [leftRecord, rightRecord] = await Promise.all([
    loadPublicZvzV2EntityRecord({
      server,
      entityKind,
      entityAlbionId: leftId,
      seasonId,
      asOfDate,
    }),
    loadPublicZvzV2EntityRecord({
      server,
      entityKind,
      entityAlbionId: rightId,
      seasonId,
      asOfDate,
    }),
  ])
  if (!leftRecord || !rightRecord) notFound()
  const left = recordRollup(leftRecord, scope)
  const right = recordRollup(rightRecord, scope)
  const leftIdentity = leftRecord.rollups.overall
  const rightIdentity = rightRecord.rollups.overall
  if (!leftIdentity || !rightIdentity) notFound()
  const paths = getMarketingPathsForEnvironment(locale)
  const snapshotDate = leftRecord.selection.snapshot?.snapshotDate
  if (!snapshotDate) notFound()
  const effectiveSeasonId = leftRecord.selection.season.id
  const leftHref = entityHref({
    basePath: paths.zvzBattles,
    server,
    entityKind,
    entityId: leftId,
    seasonId: effectiveSeasonId,
    asOfDate: snapshotDate,
    scope,
  })
  const rightHref = entityHref({
    basePath: paths.zvzBattles,
    server,
    entityKind,
    entityId: rightId,
    seasonId: effectiveSeasonId,
    asOfDate: snapshotDate,
    scope,
  })
  const headToHead = buildPublicZvzHeadToHead(
    leftRecord.evidence.map(insightEvidence),
    rightId,
  )
  const boardQuery = new URLSearchParams({
    server,
    ...(entityKind === 'guild' ? { entity: 'guild' } : {}),
    ...(scope === 'overall' ? {} : { division: scope }),
    season: effectiveSeasonId,
    asOf: snapshotDate,
  })
  const boardHref = `${paths.zvzBattles}?${boardQuery.toString()}`
  const scopeLabel = scope === 'overall' ? boardT('division_all') : boardT(`division_${scope}`)

  return (
    <PublicZvzRecordChrome>
      <PublicZvzRecordHeader
        boardHref={boardHref}
        backLabel={t('backToRanking')}
        eyebrow={t('eyebrow')}
        title={`${leftIdentity.entityName} vs ${rightIdentity.entityName}`}
        subtitle={t('subtitle', {
          server: boardT(`server_${server}`),
          season: leftRecord.selection.season.name,
          scope: scopeLabel,
          date: snapshotDate,
        })}
        badges={
          <span className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-amber-300/10 px-2.5 text-xs font-bold text-amber-200">
            <Scale size={13} aria-hidden="true" />
            {scopeLabel}
          </span>
        }
        actions={
          <PublicZvzShareButton label={t('share')} copiedLabel={t('copied')} />
        }
      />

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3">
        {[
          { row: leftIdentity, href: leftHref, tone: 'sky' as const },
          { row: rightIdentity, href: rightHref, tone: 'rose' as const },
        ].map((item, index) => (
          <div key={item.row.entityAlbionId} className={index === 1 ? 'col-start-3' : ''}>
            <Link
              href={item.href}
              className={`block text-balance text-xl font-black underline-offset-4 hover:underline sm:text-3xl ${item.tone === 'sky' ? 'text-sky-100 hover:text-sky-200' : 'text-right text-rose-100 hover:text-rose-200'}`}
            >
              {item.row.entityName}
            </Link>
            <div className={`mt-2 flex ${index === 1 ? 'justify-end' : ''}`}>
              <PublicZvzFavoriteButton
                entity={favoriteEntity({ row: item.row, href: item.href })}
                addLabel={recordT('favoriteAdd')}
                removeLabel={recordT('favoriteRemove')}
                compact
              />
            </div>
          </div>
        ))}
        <span className="col-start-2 row-start-1 inline-flex size-11 items-center justify-center rounded-full bg-white/[0.06] text-xs font-black text-gray-400 shadow-[0_0_0_1px_rgba(255,255,255,0.1)]">
          VS
        </span>
      </div>

      {left && right ? (
        <section className="mt-7 border-y border-white/[0.1] px-2 py-2 sm:px-6">
          <ComparisonValue label={t('rank')} left={`#${left.rank}`} right={`#${right.rank}`} />
          <ComparisonValue label={t('score')} left={formatPublicZvzDecimal(left.score)} right={formatPublicZvzDecimal(right.score)} />
          <ComparisonValue label={t('engagements')} left={formatPublicZvzNumber(left.engagementCount)} right={formatPublicZvzNumber(right.engagementCount)} />
          <ComparisonValue label={t('kd')} left={<PublicZvzKdScore kills={left.kills} deaths={left.deaths} label={t('kd')} size="sm" />} right={<PublicZvzKdScore kills={right.kills} deaths={right.deaths} label={t('kd')} size="sm" />} />
          <ComparisonValue label={t('force')} left={formatPublicZvzDecimal(left.representativeSize)} right={formatPublicZvzDecimal(right.representativeSize)} />
          <ComparisonValue label={t('averageIp')} left={left.averageItemPower ? formatPublicZvzNumber(Math.round(left.averageItemPower)) : '—'} right={right.averageItemPower ? formatPublicZvzNumber(Math.round(right.averageItemPower)) : '—'} />
          <ComparisonValue label={t('killFame')} left={formatPublicZvzCompact(left.killFame)} right={formatPublicZvzCompact(right.killFame)} />
        </section>
      ) : (
        <aside className="mt-7 flex items-start gap-3 bg-amber-300/[0.06] p-4 text-amber-100 shadow-[0_0_0_1px_rgba(252,211,77,0.2)]">
          <ShieldAlert size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-sm leading-6">{t('missingScope', { scope: scopeLabel })}</p>
        </aside>
      )}

      <section className="mt-8">
        <div className="flex items-center gap-2">
          <Swords size={18} className="text-amber-200" aria-hidden="true" />
          <h2 className="text-xl font-black text-white">{t('headToHeadTitle')}</h2>
        </div>
        {headToHead.encounters > 0 ? (
          <div className="mt-4 grid gap-px bg-white/[0.08] sm:grid-cols-4">
            {[
              [t('directEncounters'), formatPublicZvzNumber(headToHead.encounters)],
              [t('directRecord'), `${headToHead.wins}W · ${headToHead.even}E · ${headToHead.losses}L`],
              [t('leftKd', { name: leftIdentity.entityName }), `${formatPublicZvzNumber(headToHead.kills)}–${formatPublicZvzNumber(headToHead.deaths)}`],
              [t('directShare'), `${formatPublicZvzDecimal((headToHead.kills / Math.max(1, headToHead.kills + headToHead.deaths)) * 100)}%`],
            ].map(([label, value]) => (
              <div key={label} className="bg-[#0a0e14] p-4">
                <p className="text-xs text-gray-500">{label}</p>
                <p className="mt-2 tabular-nums text-xl font-black text-white">{value}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-pretty text-sm leading-6 text-gray-500">{t('noHeadToHead')}</p>
        )}
      </section>

      <div className="mt-8 flex justify-center">
        <Link
          href={boardHref}
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-white/[0.06] px-4 text-sm font-bold text-white transition-[background-color,scale] duration-150 ease-out hover:bg-white/[0.1] active:scale-[0.96]"
        >
          <ArrowLeft size={15} aria-hidden="true" />
          {t('chooseAnother')}
        </Link>
      </div>
    </PublicZvzRecordChrome>
  )
}
