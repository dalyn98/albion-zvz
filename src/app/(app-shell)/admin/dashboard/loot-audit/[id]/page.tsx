import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, ScrollText } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getLootAuditDetail } from '@/app/actions/loot-audit'
import type {
  LootAuditCheckStatus,
  LootAuditDepositCheckStatus,
  LootAuditLooterRelation,
} from '@/lib/loot-audit'
import { isLootAuditTargetRelation } from '@/lib/loot-audit'
import { CAP } from '@/lib/permissions'
import { getSession, sessionHasAny } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getTenantTimezone } from '@/lib/timezone-server'
import { formatDateTime } from '@/lib/format-datetime'
import LootAuditFindingActions from './LootAuditFindingActions'

export const dynamic = 'force-dynamic'

const LOOT_AUDIT_CAPS = [CAP.INVENTORY_MANAGE, CAP.CHEST_LOG_PASTE] as const
type RelationFilter = LootAuditLooterRelation | 'all' | 'target'

export default async function LootAuditDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ relation?: string | string[] }>
}) {
  const session = await getSession()
  if (!session) redirect('/')
  if (!session.isAdmin && !sessionHasAny(session, LOOT_AUDIT_CAPS)) {
    redirect('/admin/dashboard')
  }

  const guildId = await getSessionGuildId(session)
  const [{ id }, sp, t, tenantTimezone] = await Promise.all([
    params,
    searchParams,
    getTranslations('adminLootAuditPage'),
    getTenantTimezone(guildId),
  ])
  const detail = await getLootAuditDetail(id)
  if ('error' in detail) {
    if (detail.error === 'not-found') notFound()
    throw new Error(detail.error)
  }
  const relationFilter = parseRelationFilter(
    Array.isArray(sp.relation) ? sp.relation[0] : sp.relation,
  )
  const filteredItemRows = detail.itemCheckRows.filter((row) =>
    matchesRelationFilter(row.looterRelation, relationFilter),
  )
  const filteredFindings = detail.findings.filter((finding) =>
    matchesRelationFilter(finding.looterRelation, relationFilter),
  )
  const filteredDepositRows =
    relationFilter === 'target' || relationFilter === 'all'
      ? detail.depositCheckRows
      : detail.depositCheckRows.filter((row) => row.looterRelation === relationFilter)
  const checkRelationCounts = detail.itemCheckRows.reduce(
    (acc, row) => {
      acc[row.looterRelation] += 1
      return acc
    },
    { guild: 0, alliance: 0, other: 0 } as Record<LootAuditLooterRelation, number>,
  )
  const allRelationCount =
    checkRelationCounts.guild + checkRelationCounts.alliance + checkRelationCounts.other
  const targetRelationCount = checkRelationCounts.guild + checkRelationCounts.alliance
  const targetDeathLostEstimatedValue = detail.itemCheckRows
    .filter((row) => isLootAuditTargetRelation(row.looterRelation))
    .reduce((sum, row) => sum + row.deathLostEstimatedValue, 0)
  const relationTabs: { key: RelationFilter; label: string; count: number }[] = [
    { key: 'target', label: t('relationTarget'), count: targetRelationCount },
    { key: 'all', label: t('relationAll'), count: allRelationCount },
    { key: 'guild', label: t('relationGuild'), count: checkRelationCounts.guild },
    { key: 'alliance', label: t('relationAlliance'), count: checkRelationCounts.alliance },
    { key: 'other', label: t('relationOther'), count: checkRelationCounts.other },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={
            detail.audit.eventId
              ? `/admin/dashboard/loot-audit?event=${detail.audit.eventId}`
              : '/admin/dashboard/loot-audit'
          }
          className="inline-flex items-center gap-1 rounded-md border border-gray-700 px-2 py-1 text-xs text-gray-300 hover:border-amber-400 hover:text-amber-200"
        >
          <ArrowLeft size={13} />
          {t('backToList')}
        </Link>
        {detail.audit.eventId && (
          <Link
            href={`/events/${detail.audit.eventId}/report`}
            className="inline-flex min-h-9 items-center gap-1 rounded-md border border-sky-500/30 px-2 text-xs font-semibold text-sky-200 hover:border-sky-300 hover:text-white"
          >
            {t('backToEventReport')}
          </Link>
        )}
      </div>

      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <ScrollText size={22} className="text-amber-300" />
          <h1 className="text-2xl font-semibold text-white">{detail.audit.title}</h1>
        </div>
        <p className="text-sm text-gray-400">
          {t('detailMeta', {
            user: detail.audit.createdByUsername,
            date: formatDateTime(detail.audit.createdAt, tenantTimezone),
          })}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <StatCell label={t('statLootRows')} value={detail.audit.lootRowsCount} />
        <StatCell label={t('statDepositRows')} value={detail.audit.depositRowsCount} />
        <StatCell label={t('statTotalValue')} value={formatSilver(detail.audit.totalEstimatedValue)} />
        <StatCell label={t('statMissingValue')} value={formatSilver(detail.audit.missingEstimatedValue)} accent={detail.audit.missingEstimatedValue > 0 ? 'amber' : 'emerald'} />
        <StatCell label={t('statDeathLossValue')} value={formatSilver(targetDeathLostEstimatedValue)} accent={targetDeathLostEstimatedValue > 0 ? 'amber' : 'emerald'} />
        <StatCell label={t('statOpenFindings')} value={detail.audit.unresolvedFindingsCount} accent={detail.audit.unresolvedFindingsCount > 0 ? 'amber' : 'emerald'} />
      </div>

      {detail.unresolvedDepositItemNames.length > 0 && (
        <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 text-sm text-sky-100">
          {t('unresolvedDepositItems', {
            names: detail.unresolvedDepositItemNames.slice(0, 8).join(', '),
            count: detail.unresolvedDepositItemNames.length,
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {relationTabs.map((tab) => {
          const active = relationFilter === tab.key
          return (
            <Link
              key={tab.key}
              href={relationHref(id, tab.key)}
              className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                active
                  ? 'border-amber-400 bg-amber-500/15 text-amber-200'
                  : 'border-gray-700 bg-gray-900/70 text-gray-300 hover:border-gray-500 hover:text-white'
              }`}
            >
              {tab.label}
              <span className="font-mono text-[11px] text-gray-400">{tab.count}</span>
            </Link>
          )
        })}
      </div>

      <p className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-sm leading-relaxed text-amber-100">
        {t('targetAuditNotice')}
      </p>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-white">{t('depositLogTitle')}</h2>
          <p className="mt-1 text-sm text-gray-400">{t('depositLogDescription')}</p>
        </div>
        <div className="rounded-lg border border-gray-700 bg-gray-900/60">
          <div className="space-y-2 p-3 sm:hidden">
            {filteredDepositRows.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">{t('noDepositLogRows')}</p>
            ) : (
              filteredDepositRows.map((row) => (
                <article
                  key={`${row.player}-${row.itemId ?? row.itemName}`}
                  className="rounded-md border border-gray-800 bg-gray-950/50 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">{row.player}</p>
                      <p className="mt-0.5 truncate text-xs text-gray-300">{row.itemName}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-gray-500">
                        {row.itemId ?? t('depositItemUnresolved')}
                      </p>
                    </div>
                    <DepositCheckStatusBadge
                      status={row.status}
                      labels={{
                        matched: t('depositCheckStatusMatched'),
                        extra: t('depositCheckStatusExtra'),
                        unresolved: t('depositCheckStatusUnresolved'),
                      }}
                    />
                  </div>
                  <dl className="mt-3 grid grid-cols-4 gap-2 border-t border-gray-800 pt-2 text-xs">
                    <div>
                      <dt className="text-gray-500">{t('colDeposited')}</dt>
                      <dd className="mt-0.5 font-mono text-gray-200">{row.depositedQuantity}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">{t('colExpected')}</dt>
                      <dd className="mt-0.5 font-mono text-gray-200">{row.expectedQuantity}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">{t('colMatched')}</dt>
                      <dd className="mt-0.5 font-mono text-emerald-200">{row.matchedQuantity}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">{t('colExtra')}</dt>
                      <dd className="mt-0.5 font-mono text-amber-200">{row.extraQuantity}</dd>
                    </div>
                    <div className="col-span-4">
                      <dt className="text-gray-500">{t('colLogRows')}</dt>
                      <dd className="mt-0.5 font-mono text-gray-200">{row.rowCount}</dd>
                    </div>
                  </dl>
                </article>
              ))
            )}
          </div>
          <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="border-b border-gray-700 bg-gray-800/70 text-xs text-gray-400">
              <tr>
                <th className="px-3 py-2 font-medium">{t('colDepositStatus')}</th>
                <th className="px-3 py-2 font-medium">{t('colMember')}</th>
                <th className="px-3 py-2 font-medium">{t('colItem')}</th>
                <th className="px-3 py-2 font-medium">{t('colDeposited')}</th>
                <th className="px-3 py-2 font-medium">{t('colExpected')}</th>
                <th className="px-3 py-2 font-medium">{t('colMatched')}</th>
                <th className="px-3 py-2 font-medium">{t('colExtra')}</th>
                <th className="px-3 py-2 font-medium">{t('colLogRows')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredDepositRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-sm text-gray-500">
                    {t('noDepositLogRows')}
                  </td>
                </tr>
              ) : (
                filteredDepositRows.map((row) => (
                  <tr
                    key={`${row.player}-${row.itemId ?? row.itemName}`}
                    className="align-top text-gray-200"
                  >
                    <td className="px-3 py-3">
                      <DepositCheckStatusBadge
                        status={row.status}
                        labels={{
                          matched: t('depositCheckStatusMatched'),
                          extra: t('depositCheckStatusExtra'),
                          unresolved: t('depositCheckStatusUnresolved'),
                        }}
                      />
                    </td>
                    <td className="px-3 py-3 font-medium text-white">{row.player}</td>
                    <td className="px-3 py-3">
                      <p>{row.itemName}</p>
                      <p className="font-mono text-[11px] text-gray-500">
                        {row.itemId ?? t('depositItemUnresolved')}
                      </p>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">{row.depositedQuantity}</td>
                    <td className="px-3 py-3 font-mono text-xs">{row.expectedQuantity}</td>
                    <td className="px-3 py-3 font-mono text-xs text-emerald-200">{row.matchedQuantity}</td>
                    <td className="px-3 py-3 font-mono text-xs text-amber-200">{row.extraQuantity}</td>
                    <td className="px-3 py-3 font-mono text-xs">{row.rowCount}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-white">{t('chestCheckTitle')}</h2>
          <p className="mt-1 text-sm text-gray-400">{t('itemCheckDescription')}</p>
        </div>
        <div className="rounded-lg border border-gray-700 bg-gray-900/60">
          <div className="space-y-2 p-3 sm:hidden">
            {filteredItemRows.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">{t('noChestCheckRows')}</p>
            ) : (
              filteredItemRows.map((row) => (
                <article key={row.itemId} className="rounded-md border border-gray-800 bg-gray-950/50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-gray-100">{row.itemName}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-gray-500">{row.itemId}</p>
                    </div>
                    <RelationBadge
                      relation={row.looterRelation}
                      labels={{
                        guild: t('relationGuild'),
                        alliance: t('relationAlliance'),
                        other: t('relationOther'),
                      }}
                    />
                  </div>
                  <p className="mt-2 truncate text-xs text-gray-400">{formatLooterNames(row.looterNames)}</p>
                  <DepositStatus
                    status={row.status}
                    labels={{
                      complete: t('depositStatusComplete'),
                      partial: t('depositStatusPartial'),
                      missing: t('depositStatusMissing'),
                      death_loss: t('depositStatusDeathLoss'),
                      partial_death_loss: t('depositStatusPartialDeathLoss'),
                    }}
                  />
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-gray-800 pt-2 text-xs">
                    <div>
                      <dt className="text-gray-500">{t('colLooted')}</dt>
                      <dd className="mt-0.5 font-mono text-gray-200">{row.lootedQuantity}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">{t('colExpected')}</dt>
                      <dd className="mt-0.5 font-mono text-gray-200">{row.expectedQuantity}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">{t('colDeposited')}</dt>
                      <dd className="mt-0.5 font-mono text-gray-200">{row.depositedQuantity}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">{t('colMissing')}</dt>
                      <dd className="mt-0.5 font-mono text-amber-200">{row.missingQuantity}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">{t('colDeathLoss')}</dt>
                      <dd className="mt-0.5 font-mono text-sky-200">{row.deathLostQuantity}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">{t('colMissingValue')}</dt>
                      <dd className="mt-0.5 font-mono text-amber-200">
                        {formatSilver(row.missingEstimatedValue)}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))
            )}
          </div>
          <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead className="border-b border-gray-700 bg-gray-800/70 text-xs text-gray-400">
              <tr>
                <th className="px-3 py-2 font-medium">{t('colRelation')}</th>
                <th className="px-3 py-2 font-medium">{t('colLooters')}</th>
                <th className="px-3 py-2 font-medium">{t('colItem')}</th>
                <th className="px-3 py-2 font-medium">{t('colLooted')}</th>
                <th className="px-3 py-2 font-medium">{t('colExpected')}</th>
                <th className="px-3 py-2 font-medium">{t('colDeposited')}</th>
                <th className="px-3 py-2 font-medium">{t('colMissing')}</th>
                <th className="px-3 py-2 font-medium">{t('colDeathLoss')}</th>
                <th className="px-3 py-2 font-medium">{t('colMissingValue')}</th>
                <th className="px-3 py-2 font-medium">{t('colDepositStatus')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredItemRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-sm text-gray-500">
                    {t('noChestCheckRows')}
                  </td>
                </tr>
              ) : (
                filteredItemRows.map((row) => (
                  <tr key={row.itemId} className="align-top text-gray-200">
                    <td className="px-3 py-3">
                      <RelationBadge
                        relation={row.looterRelation}
                        labels={{
                          guild: t('relationGuild'),
                          alliance: t('relationAlliance'),
                          other: t('relationOther'),
                        }}
                      />
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-300">
                      {formatLooterNames(row.looterNames)}
                    </td>
                    <td className="px-3 py-3">
                      <p>{row.itemName}</p>
                      <p className="font-mono text-[11px] text-gray-500">{row.itemId}</p>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">{row.lootedQuantity}</td>
                    <td className="px-3 py-3 font-mono text-xs">{row.expectedQuantity}</td>
                    <td className="px-3 py-3 font-mono text-xs">{row.depositedQuantity}</td>
                    <td className="px-3 py-3 font-mono text-xs text-amber-200">{row.missingQuantity}</td>
                    <td className="px-3 py-3 font-mono text-xs text-sky-200">{row.deathLostQuantity}</td>
                    <td className="px-3 py-3 font-mono text-xs text-amber-200">
                      {formatSilver(row.missingEstimatedValue)}
                    </td>
                    <td className="px-3 py-3">
                      <DepositStatus
                        status={row.status}
                        labels={{
                          complete: t('depositStatusComplete'),
                          partial: t('depositStatusPartial'),
                          missing: t('depositStatusMissing'),
                          death_loss: t('depositStatusDeathLoss'),
                          partial_death_loss: t('depositStatusPartialDeathLoss'),
                        }}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">{t('findingsTitle')}</h2>
        <div className="rounded-lg border border-gray-700 bg-gray-900/60">
          <div className="space-y-2 p-3 sm:hidden">
            {detail.findings.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">{t('noSavedFindings')}</p>
            ) : filteredFindings.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">{t('noFilteredFindings')}</p>
            ) : (
              filteredFindings.map((finding) => (
                <article key={finding.id} className="rounded-md border border-gray-800 bg-gray-950/50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-gray-100">{finding.itemName}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-gray-500">{finding.itemId}</p>
                    </div>
                    <RelationBadge
                      relation={finding.looterRelation}
                      labels={{
                        guild: t('relationGuild'),
                        alliance: t('relationAlliance'),
                        other: t('relationOther'),
                      }}
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-xs font-medium text-white">
                      {finding.scope === 'item_pool' ? t('findingScopeItemPool') : finding.lootedByName}
                    </p>
                    <FindingStatus
                      status={finding.status}
                      labels={{
                        open: t('statusOpen'),
                        resolved: t('statusResolved'),
                        ignored: t('statusIgnored'),
                      }}
                    />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-gray-800 pt-2 text-xs">
                    <div>
                      <dt className="text-gray-500">{t('colExpected')}</dt>
                      <dd className="mt-0.5 font-mono text-gray-200">{finding.expectedQuantity}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">{t('colDeposited')}</dt>
                      <dd className="mt-0.5 font-mono text-gray-200">{finding.depositedQuantity}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">{t('colMissing')}</dt>
                      <dd className="mt-0.5 font-mono text-amber-200">{finding.missingQuantity}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">{t('colMissingValue')}</dt>
                      <dd className="mt-0.5 font-mono text-amber-200">
                        {formatSilver(finding.missingEstimatedValue)}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-3 border-t border-gray-800 pt-2">
                    <LootAuditFindingActions finding={finding} />
                  </div>
                </article>
              ))
            )}
          </div>
          <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-gray-700 bg-gray-800/70 text-xs text-gray-400">
              <tr>
                <th className="px-3 py-2 font-medium">{t('colRelation')}</th>
                <th className="px-3 py-2 font-medium">{t('colScope')}</th>
                <th className="px-3 py-2 font-medium">{t('colItem')}</th>
                <th className="px-3 py-2 font-medium">{t('colExpected')}</th>
                <th className="px-3 py-2 font-medium">{t('colDeposited')}</th>
                <th className="px-3 py-2 font-medium">{t('colMissing')}</th>
                <th className="px-3 py-2 font-medium">{t('colMissingValue')}</th>
                <th className="px-3 py-2 font-medium">{t('colStatus')}</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {detail.findings.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-sm text-gray-500">
                    {t('noSavedFindings')}
                  </td>
                </tr>
              ) : filteredFindings.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-sm text-gray-500">
                    {t('noFilteredFindings')}
                  </td>
                </tr>
              ) : (
                filteredFindings.map((finding) => (
                  <tr key={finding.id} className="align-top text-gray-200">
                    <td className="px-3 py-3">
                      <RelationBadge
                        relation={finding.looterRelation}
                        labels={{
                          guild: t('relationGuild'),
                          alliance: t('relationAlliance'),
                          other: t('relationOther'),
                        }}
                      />
                    </td>
                    <td className="px-3 py-3 font-medium text-white">
                      {finding.scope === 'item_pool'
                        ? t('findingScopeItemPool')
                        : finding.lootedByName}
                    </td>
                    <td className="px-3 py-3">
                      <p>{finding.itemName}</p>
                      <p className="font-mono text-[11px] text-gray-500">{finding.itemId}</p>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">{finding.expectedQuantity}</td>
                    <td className="px-3 py-3 font-mono text-xs">{finding.depositedQuantity}</td>
                    <td className="px-3 py-3 font-mono text-xs text-amber-200">{finding.missingQuantity}</td>
                    <td className="px-3 py-3 font-mono text-xs text-amber-200">
                      {formatSilver(finding.missingEstimatedValue)}
                    </td>
                    <td className="px-3 py-3">
                      <FindingStatus
                        status={finding.status}
                        labels={{
                          open: t('statusOpen'),
                          resolved: t('statusResolved'),
                          ignored: t('statusIgnored'),
                        }}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <LootAuditFindingActions finding={finding} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>
      </section>
    </div>
  )
}

function FindingStatus({
  status,
  labels,
}: {
  status: string
  labels: { open: string; resolved: string; ignored: string }
}) {
  const color =
    status === 'open'
      ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
      : status === 'ignored'
        ? 'border-gray-500/40 bg-gray-500/10 text-gray-300'
        : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
  return (
    <span className={`inline-flex rounded-md border px-2 py-1 text-xs ${color}`}>
      {status === 'open' ? labels.open : status === 'ignored' ? labels.ignored : labels.resolved}
    </span>
  )
}

function RelationBadge({
  relation,
  labels,
}: {
  relation: LootAuditLooterRelation
  labels: Record<LootAuditLooterRelation, string>
}) {
  const color =
    relation === 'guild'
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
      : relation === 'alliance'
        ? 'border-sky-500/40 bg-sky-500/10 text-sky-200'
        : 'border-gray-500/40 bg-gray-500/10 text-gray-300'
  return (
    <span className={`inline-flex rounded-md border px-2 py-1 text-xs ${color}`}>
      {labels[relation]}
    </span>
  )
}

function DepositCheckStatusBadge({
  status,
  labels,
}: {
  status: LootAuditDepositCheckStatus
  labels: Record<LootAuditDepositCheckStatus, string>
}) {
  const color =
    status === 'matched'
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
      : status === 'extra'
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
        : 'border-sky-500/40 bg-sky-500/10 text-sky-200'
  return (
    <span className={`inline-flex rounded-md border px-2 py-1 text-xs ${color}`}>
      {labels[status]}
    </span>
  )
}

function DepositStatus({
  status,
  labels,
}: {
  status: LootAuditCheckStatus
  labels: Record<LootAuditCheckStatus, string>
}) {
  const color =
    status === 'complete'
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
      : status === 'partial'
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
        : status === 'death_loss' || status === 'partial_death_loss'
          ? 'border-sky-500/40 bg-sky-500/10 text-sky-200'
          : 'border-rose-500/40 bg-rose-500/10 text-rose-200'
  return (
    <span className={`inline-flex rounded-md border px-2 py-1 text-xs ${color}`}>
      {labels[status]}
    </span>
  )
}

function StatCell({
  label,
  value,
  accent,
}: {
  label: string
  value: number | string
  accent?: 'amber' | 'emerald'
}) {
  const color = accent === 'amber'
    ? 'text-amber-200'
    : accent === 'emerald'
      ? 'text-emerald-200'
      : 'text-white'
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900/70 px-3 py-2">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className={`mt-0.5 font-mono text-lg font-semibold ${color}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
    </div>
  )
}

function formatSilver(value: number): string {
  return Math.round(value).toLocaleString()
}

function formatLooterNames(names: readonly string[]): string {
  if (names.length <= 3) return names.join(', ')
  return `${names.slice(0, 3).join(', ')} +${names.length - 3}`
}

function parseRelationFilter(value: string | undefined): RelationFilter {
  if (value === 'all' || value === 'guild' || value === 'alliance' || value === 'other') {
    return value
  }
  return 'target'
}

function relationHref(auditId: string, filter: RelationFilter): string {
  if (filter === 'target') return `/admin/dashboard/loot-audit/${auditId}`
  return `/admin/dashboard/loot-audit/${auditId}?relation=${filter}`
}

function matchesRelationFilter(
  relation: LootAuditLooterRelation,
  filter: RelationFilter,
): boolean {
  if (filter === 'all') return true
  if (filter === 'target') return isLootAuditTargetRelation(relation)
  return relation === filter
}
