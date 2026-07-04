import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Swords, Info, ChevronRight, Globe2 } from 'lucide-react'
import { getSession, sessionHas } from '@/lib/session'
import { getSessionGuildId, getTenantDiscordConfig } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import { CAP } from '@/lib/permissions'
import BattleRecordList from '@/components/BattleRecordList'
import { isLocale } from '@/i18n/locales'
import { getMarketingPathsForHost } from '@/lib/marketing-paths'
import { getTenantTimezone } from '@/lib/timezone-server'
import {
  groupGuildBattleSessions,
  groupGuildBattleListRows,
  normalizeGuildBattleActivityFilter,
  normalizeGuildBattleDateFilter,
  normalizeGuildBattleListMode,
  normalizeGuildBattleMinPlayers,
  normalizeGuildBattleResultFilter,
  normalizeGuildBattleSearchQuery,
  normalizeGuildBattleServerFilter,
  toGuildBattleEndDateExclusiveIso,
  toGuildBattleListRow,
  type GuildBattleViewDbRow,
} from '@/lib/guild-battle-view'

export const dynamic = 'force-dynamic'

interface SearchParams {
  view?: string
  tab?: string
  result?: string
  outcome?: string
  server?: string
  min?: string
  activity?: string
  q?: string
  from?: string
  to?: string
}

const LIST_SESSION_LIMIT = 40
const LIST_ROW_FETCH_LIMIT = 240

export default async function BattlesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const [sp, session, t, tCommon, headersList] = await Promise.all([
    searchParams,
    getSession(),
    getTranslations('battleTracking'),
    getTranslations('common'),
    headers(),
  ])
  if (!session) {
    redirect('/api/auth/discord/start?returnTo=/battles')
  }
  const guildId = await getSessionGuildId(session)

  const activeMode = normalizeGuildBattleListMode(sp.view ?? sp.tab)
  const resultFilter = normalizeGuildBattleResultFilter(sp.result ?? sp.outcome)
  const serverFilter = normalizeGuildBattleServerFilter(sp.server)
  const minPlayersFilter = normalizeGuildBattleMinPlayers(sp.min)
  const activityFilter = normalizeGuildBattleActivityFilter(sp.activity)
  const searchQuery = normalizeGuildBattleSearchQuery(sp.q)
  const fromDate = normalizeGuildBattleDateFilter(sp.from)
  const toDate = normalizeGuildBattleDateFilter(sp.to)
  const seoLocale = headersList.get('x-seo-locale')
  const publicBoardHref = getMarketingPathsForHost(
    headersList.get('host'),
    isLocale(seoLocale) ? seoLocale : null,
  ).zvzBattles

  // guildId 는 session 에서 내려와 사용자가 자기 tenant 외 데이터를 볼 수 없음.
  // 관리자 클라이언트는 RLS 를 우회해도 새 read model 의 tenant_id 로 명시적
  // 스코프 유지. legacy tenant_battle_records 는 view 내부의 호환 join 일 뿐이다.
  const db = getAdminClient()
  let query = db
    .from('guild_battle_views')
    .select(
      'id, tenant_id, battle_record_id, legacy_tenant_battle_record_id, albion_server, albion_battle_id, started_at, ended_at, cluster_name, total_players, total_kills, total_fame, subject_name, subject_alliance_name, relation_scope, opponent_force_kind, opponent_force_name, subject_team_size, subject_kills, subject_deaths, subject_kill_fame, opponent_team_size, opponent_kills, opponent_deaths, opponent_kill_fame, status, evidence_source, is_meaningful, view_policy, activity_kind, activity_source, activity_reason, automatic_activity_kind, automatic_activity_reason, result_estimate, size_category, legacy_outcome, legacy_row_outcome, legacy_is_provisional, match_index, match_total, has_active_diff, active_diff_types, evaluated_at',
    )
    .eq('tenant_id', guildId)
    .order('started_at', { ascending: false })
    .order('relation_scope', { ascending: true })
    .order('opponent_team_size', { ascending: false })
    .limit(LIST_ROW_FETCH_LIMIT)

  if (activeMode === 'default') {
    query = query
      .eq('relation_scope', 'direct')
      .eq('view_policy', 'default_meaningful')
      .eq('activity_kind', 'zvz')
  } else if (activeMode === 'direct') {
    query = query.eq('relation_scope', 'direct')
  } else if (activeMode === 'alliance') {
    query = query.eq('relation_scope', 'alliance')
  } else if (activeMode === 'excluded') {
    query = query.eq('view_policy', 'small_or_low_engagement')
  } else {
    query = query.eq('has_active_diff', true)
  }
  if (resultFilter) query = query.eq('result_estimate', resultFilter)
  if (serverFilter) query = query.eq('albion_server', serverFilter)
  if (minPlayersFilter) {
    query = query.or(
      `subject_team_size.gte.${minPlayersFilter},opponent_team_size.gte.${minPlayersFilter}`,
    )
  }
  if (activityFilter) query = query.eq('activity_kind', activityFilter)
  if (fromDate) query = query.gte('started_at', `${fromDate}T00:00:00.000Z`)
  if (toDate) query = query.lt('started_at', toGuildBattleEndDateExclusiveIso(toDate))
  if (searchQuery) {
    const battleId = /^\d+$/.test(searchQuery) ? Number(searchQuery) : null
    query = battleId
      ? query.eq('albion_battle_id', battleId)
      : query.ilike('opponent_force_name', `%${searchQuery}%`)
  }

  const [tenantTimezone, tenantConfig, { data, error }] = await Promise.all([
    getTenantTimezone(guildId),
    getTenantDiscordConfig(guildId),
    query,
  ])

  const rows = ((data ?? []) as GuildBattleViewDbRow[]).map(toGuildBattleListRow)
  const groups = groupGuildBattleListRows(rows)
  const sessions = groupGuildBattleSessions(groups, LIST_SESSION_LIMIT)

  return (
    <main className="flex-1 w-full max-w-3xl xl:max-w-6xl 2xl:max-w-7xl mx-auto px-4 py-6 sm:py-8 space-y-5">
      <div className="flex items-start gap-3">
        <Swords size={20} className="text-amber-400 mt-1" />
        <div>
          <h1 className="text-2xl font-bold text-white">{t('listTitle')}</h1>
          <p className="text-gray-500 text-sm mt-1">{t('listDescription')}</p>
        </div>
      </div>

      <div className="bg-gray-950/50 border border-gray-800 rounded-lg p-3 space-y-2">
        <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
          <Info size={12} />
          <span className="font-semibold text-amber-300">{t('tipTitle')}</span>
        </p>
        <ul className="text-[11px] text-gray-500 list-disc list-inside space-y-1">
          <li>{t('tipMatch')}</li>
          <li>{t('tipEngagement')}</li>
          <li>{t('tipOutcome')}</li>
          <li>{t('tipLimitation')}</li>
        </ul>
        <details className="group pt-1">
          <summary className="cursor-pointer text-[11px] text-amber-300/80 hover:text-amber-300 list-none flex items-center gap-1 select-none">
            <ChevronRight
              size={12}
              className="transition-transform group-open:rotate-90"
            />
            <span className="underline-offset-2 group-hover:underline">
              {t('rulesShowMore')}
            </span>
          </summary>
          <div className="mt-3 space-y-3 text-[11px] text-gray-400 leading-relaxed">
            <p className="text-gray-500">{t('rulesIntro')}</p>
            <div className="space-y-1">
              <h4 className="text-amber-200/90 font-semibold">{t('rule1Title')}</h4>
              <p>{t('rule1Body')}</p>
            </div>
            <div className="space-y-1">
              <h4 className="text-amber-200/90 font-semibold">{t('rule2Title')}</h4>
              <p>{t('rule2Intro')}</p>
              <ul className="list-disc list-inside ml-2 space-y-0.5 text-gray-500">
                <li>{t('rule2Small')}</li>
                <li>{t('rule2Middle')}</li>
                <li>{t('rule2Large')}</li>
                <li>{t('rule2Zerg')}</li>
              </ul>
              <p className="text-gray-500 italic">{t('rule2CutOff')}</p>
            </div>
            <div className="space-y-1">
              <h4 className="text-amber-200/90 font-semibold">{t('rule3Title')}</h4>
              <p>{t('rule3Body')}</p>
              <p className="text-gray-500 italic">{t('rule3Why')}</p>
            </div>
            <div className="space-y-1">
              <h4 className="text-amber-200/90 font-semibold">{t('rule4Title')}</h4>
              <p>{t('rule4Body')}</p>
            </div>
            <div className="space-y-1">
              <h4 className="text-amber-200/90 font-semibold">{t('rule5Title')}</h4>
              <p>{t('rule5Body')}</p>
            </div>
            <div className="space-y-1">
              <h4 className="text-amber-200/90 font-semibold">{t('rule6Title')}</h4>
              <p>{t('rule6Body')}</p>
            </div>
            <div className="space-y-1 border-t border-gray-800 pt-2">
              <h4 className="text-amber-200/90 font-semibold">
                {t('rulesLimitTitle')}
              </h4>
              <ul className="list-disc list-inside ml-2 space-y-0.5 text-gray-500">
                <li>{t('rulesLimit1')}</li>
                <li>{t('rulesLimit2')}</li>
              </ul>
            </div>
          </div>
        </details>
        <div className="flex flex-col gap-2 border-t border-gray-800 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <Globe2 size={14} className="mt-0.5 shrink-0 text-sky-300" />
            <div>
              <p className="text-xs font-semibold text-white">{t('publicBoardCtaTitle')}</p>
              <p className="mt-0.5 text-[11px] text-gray-500">
                {t('publicBoardCtaBody')}
              </p>
            </div>
          </div>
          <Link
            href={publicBoardHref}
            className="inline-flex min-h-10 items-center justify-center rounded-md bg-sky-300 px-3 py-1.5 text-xs font-semibold text-slate-950 transition-[background-color,scale] hover:bg-sky-200 active:scale-[0.96]"
          >
            {t('publicBoardCtaAction')}
          </Link>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-400 text-sm">{error.message}</p>
        </div>
      )}

      <BattleRecordList
        sessions={sessions}
        timezone={tenantTimezone}
        tenantSlug={tenantConfig?.slug ?? null}
        canManageActivityOverrides={sessionHas(session, CAP.BATTLES_MANAGE)}
        activeMode={activeMode}
        resultFilter={resultFilter}
        serverFilter={serverFilter}
        minPlayersFilter={minPlayersFilter}
        activityFilter={activityFilter}
        searchQuery={searchQuery}
        fromDate={fromDate}
        toDate={toDate}
        emptyLabel={t('empty')}
        filterResultLabel={t('filterResult')}
        filterAllLabel={tCommon('all')}
        filterServerLabel={t('filterServer')}
        filterServerAllLabel={t('filterServerAll')}
        filterMinPlayersLabel={t('filterMinPlayers')}
        filterActivityLabel={t('filterActivity')}
        filterActivityAllLabel={t('filterActivityAll')}
        filterSearchLabel={t('filterSearch')}
        filterSearchPlaceholder={t('filterSearchPlaceholder')}
        filterFromLabel={t('filterFrom')}
        filterToLabel={t('filterTo')}
        filterApplyLabel={t('filterApply')}
        filterResetLabel={t('filterReset')}
        activeFiltersLabel={t('activeFiltersLabel')}
        minPlayersChipLabel={t('minPlayersChip', { count: minPlayersFilter ?? 0 })}
        serverLabels={{
          west: t('serverWest'),
          east: t('serverEast'),
          europe: t('serverEurope'),
        }}
        modeLabels={{
          default: t('viewDefault'),
          direct: t('viewDirect'),
          alliance: t('viewAlliance'),
          excluded: t('viewExcluded'),
          diffs: t('viewDiffs'),
        }}
        sizeLabels={{
          small: t('size_small'),
          middle: t('size_middle'),
          large: t('size_large'),
          zerg: t('size_zerg'),
        }}
        relationLabels={{
          direct: t('relationDirect'),
          alliance: t('relationAlliance'),
        }}
        policyLabels={{
          default_meaningful: t('policyDefault'),
          small_or_low_engagement: t('policyExcluded'),
        }}
        activityLabels={{
          zvz: t('activity_zvz'),
          smallscale: t('activity_smallscale'),
          ganking: t('activity_ganking'),
          low_engagement: t('activity_lowEngagement'),
          review: t('activity_review'),
          excluded: t('activity_excluded'),
        }}
        activitySourceLabels={{
          automatic: t('activitySource_automatic'),
          event_intent: t('activitySource_eventIntent'),
          manual: t('activitySource_manual'),
        }}
        activityOverrideLabels={{
          markGanking: t('activityMarkGanking'),
          markZvZ: t('activityMarkZvZ'),
          reset: t('activityResetOverride'),
          updating: t('activityOverrideUpdating'),
        }}
        resultLabels={{
          advantage: t('result_advantage'),
          disadvantage: t('result_disadvantage'),
          even: t('result_even'),
          unclear: t('result_unclear'),
        }}
        displayResultLabels={{
          advantage: t('result_advantage'),
          disadvantage: t('result_disadvantage'),
          even: t('result_even'),
          mixed: t('result_mixed'),
          pending: t('result_pending'),
        }}
        statusLabels={{
          provisional: t('status_provisional'),
          final: t('status_final'),
          low_confidence: t('status_lowConfidence'),
        }}
        evidenceLabels={{
          battle_summary: t('evidence_battleSummary'),
          killboard_events: t('evidence_killboardEvents'),
        }}
        opponentKindLabels={{
          alliance: t('mainOpponentAlliance'),
          guild: t('mainOpponentGuild'),
        }}
        sameBattleLabel={t('sameBattleLabel')}
        expandMatchupsLabel={t('expandMatchupsLabel')}
        collapseMatchupsLabel={t('collapseMatchupsLabel')}
        diffLabel={t('diffLabel')}
        ledgerOnlyLabel={t('ledgerOnlyLabel')}
        battleSingularLabel={t('battleSingular')}
        battlePluralLabel={t('battlePlural')}
        detailsLabel={t('detailsAction')}
        shareLabel={t('shareAction')}
        battleIdsLabel={t('battleIdsLabel')}
        moreForcesLabel={t('moreForcesLabel')}
        forceColumnLabels={{
          name: t('forceColName'),
          players: t('forceColPlayers'),
          kills: t('forceColKills'),
          deaths: t('forceColDeaths'),
          fame: t('forceColFame'),
        }}
        columnLabels={{
          startedAt: t('colStartedAt'),
          scope: t('colScope'),
          opponent: t('colOpponent'),
          result: t('colResult'),
          kdfame: t('colKdFame'),
          cluster: t('colCluster'),
        }}
      />
    </main>
  )
}
