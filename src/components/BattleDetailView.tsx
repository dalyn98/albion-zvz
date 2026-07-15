import Link from 'next/link'
import {
  Swords,
  MapPin,
  Clock,
  Sword,
  Shield,
  ChevronDown,
  EyeOff,
  Users,
  UserCircle2,
  GitBranch,
  Hourglass,
  Flag,
} from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import MemberAvatar from './MemberAvatar'
import { formatDateTime, formatTime } from '@/lib/format-datetime'
import type { BattleDetail, BattleForceEngagement, BattleKillEvent } from '@/app/actions/battles'
import { getLocalizedItemNameWithEnchant } from '@/lib/item-names'
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n/locales'
import { BattleResultBadge } from '@/components/BattleResultBadge'
import {
  estimateToDisplayResult,
  type GuildBattleDisplayResult,
} from '@/lib/guild-battle-view'

// 참가자 카드는 K/D 요약을 기본 노출하고, 해당 전투에서 찍힌 개별 킬로그(상대/
// IP/fame) 는 <details> 로 접어둔다. 리스트가 길면 페이지가 킬로그로 도배돼
// 모바일에서 훑기 힘들어지므로 기본은 접힘, 필요할 때만 펼쳐본다.
// client 컴포넌트 만들 필요 없이 native <details> 로 상태를 브라우저에 맡김.

// 상대 라벨: 길드/연합 둘 다 있으면 `Name [Guild] [Alliance]`, 길드만 있으면
// `Name [Guild]`. 연합은 알비온 API 가 nullable 로 내려주는 필드 (무소속/언게임
// 캐릭터) 라 부재 시 해당 브래킷만 빠진다.
function formatOpponentLabel(
  name: string,
  guild: string | null,
  alliance: string | null,
): string {
  let label = name
  if (guild) label += ` [${guild}]`
  if (alliance) label += ` [${alliance}]`
  return label
}

interface Props {
  detail: BattleDetail
  // /battles/[id] 의 라우팅 id — cross-link 생성에 필요. detail.id 는 활성
  // tenant 의 row id 라 cross 시점일 땐 다른 값일 수 있어서 별도 prop 으로 받는다.
  battleId: string
  timezone: string
  highlightedEventId?: string
}

export default async function BattleDetailView({
  detail,
  battleId,
  timezone,
  highlightedEventId,
}: Props) {
  const [t, tList, rawLocale] = await Promise.all([
    getTranslations('battleDetail'),
    getTranslations('battleTracking'),
    getLocale(),
  ])
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE

  const displayResultLabels: Record<GuildBattleDisplayResult, string> = {
    advantage: tList('result_advantage'),
    disadvantage: tList('result_disadvantage'),
    even: tList('result_even'),
    mixed: tList('result_mixed'),
    pending: tList('result_pending'),
  }
  const detailDisplayResult = estimateToDisplayResult(detail.resultEstimate)
  const outcomeLabel = displayResultLabels[detailDisplayResult]
  const sizeLabel = detail.sizeCategory
    ? tList(
        detail.sizeCategory === 'small'
          ? 'size_small'
          : detail.sizeCategory === 'middle'
            ? 'size_middle'
            : detail.sizeCategory === 'large'
              ? 'size_large'
              : 'size_zerg',
      )
    : tList('size_unknown')

  // 헤더 표제 = 주 상대(mainOpponentName). alliance 인 경우엔 알라이언스 명,
  // 단독 길드는 길드 명. 같은 battle 에 다른 force 가 있어도 매치업 분리 row 가
  // 따로 생성되므로 여기서는 한 force 만 노출.
  const opponentLabel = detail.mainOpponentName || '-'
  const mainOpponentBadgeLabel =
    detail.mainOpponentKind === 'alliance'
      ? tList('mainOpponentAlliance')
      : detail.mainOpponentKind === 'guild'
        ? tList('mainOpponentGuild')
        : null
  const matchSplitLabel = tList('matchSplitLabel')
  const provisionalLabel = tList('provisionalLabel')
  const relationLabel = tList(
    detail.relationScope === 'direct' ? 'relationDirect' : 'relationAlliance',
  )
  const policyLabel = tList(
    detail.viewPolicy === 'default_meaningful' ? 'policyDefault' : 'policyExcluded',
  )
  const statusLabel = tList(`status_${detail.projectionStatus === 'low_confidence' ? 'lowConfidence' : detail.projectionStatus}`)
  const evidenceLabel = tList(
    detail.evidenceSource === 'battle_summary'
      ? 'evidence_battleSummary'
      : 'evidence_killboardEvents',
  )

  const participants = groupByMember(detail.events)
  const playerGuildGroups = groupPlayersByGuild({
    players: detail.players,
    homeGuildName: detail.homeGuildName,
    mainOpponentName: detail.mainOpponentName,
    primaryOpponentName: detail.primaryOpponentName,
  })
  const isCross = detail.perspectiveKind === 'cross'

  return (
    <>
      {isCross && detail.perspectiveTenantName && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 flex items-start gap-2">
          <EyeOff size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="space-y-0.5 min-w-0 flex-1">
            <p className="text-amber-200 text-xs font-semibold">
              {t('crossPerspectiveBanner', { tenant: detail.perspectiveTenantName })}
            </p>
            <p className="text-amber-300/70 text-[11px]">{t('crossPerspectiveHint')}</p>
          </div>
        </div>
      )}

      {!isCross && detail.crossTenants.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 space-y-1.5">
          <p className="text-gray-400 text-[11px] font-semibold flex items-center gap-1">
            <Users size={11} />
            {t('crossPerspectiveAvailable')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {detail.crossTenants.map((peer) => (
              <Link
                key={peer.slug}
                href={`/battles/${battleId}?perspective=${encodeURIComponent(peer.slug)}`}
                className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 transition-colors"
              >
                <EyeOff size={10} />
                {t('crossPerspectiveLink', { tenant: peer.name })}
              </Link>
            ))}
          </div>
        </div>
      )}

      {detail.matchTotal > 1 && (
        <div className="bg-violet-500/10 border border-violet-500/30 rounded-lg px-3 py-2 flex items-start gap-2">
          <GitBranch size={14} className="text-violet-400 mt-0.5 flex-shrink-0" />
          <div className="space-y-0.5 min-w-0 flex-1">
            <p className="text-violet-200 text-xs font-semibold">
              {t('matchSplitBannerTitle', {
                index: detail.matchIndex,
                total: detail.matchTotal,
              })}
            </p>
            <p className="text-violet-300/70 text-[11px]">{t('matchSplitBannerHint')}</p>
          </div>
        </div>
      )}

      {detail.relationScope === 'alliance' && (
        <div className="bg-sky-500/10 border border-sky-500/30 rounded-lg px-3 py-2 flex items-start gap-2">
          <EyeOff size={14} className="text-sky-300 mt-0.5 flex-shrink-0" />
          <div className="space-y-0.5 min-w-0 flex-1">
            <p className="text-sky-100 text-xs font-semibold">{t('ledgerAllianceTitle')}</p>
            <p className="text-sky-200/70 text-[11px]">{t('ledgerAllianceHint')}</p>
          </div>
        </div>
      )}

      {detail.viewPolicy === 'small_or_low_engagement' && (
        <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 flex items-start gap-2">
          <EyeOff size={14} className="text-gray-300 mt-0.5 flex-shrink-0" />
          <div className="space-y-0.5 min-w-0 flex-1">
            <p className="text-gray-200 text-xs font-semibold">{t('ledgerExcludedTitle')}</p>
            <p className="text-gray-400 text-[11px]">{t('ledgerExcludedHint')}</p>
          </div>
        </div>
      )}

      {detail.hasActiveDiff && (
        <div className="bg-violet-500/10 border border-violet-500/30 rounded-lg px-3 py-2 flex items-start gap-2">
          <GitBranch size={14} className="text-violet-300 mt-0.5 flex-shrink-0" />
          <div className="space-y-0.5 min-w-0 flex-1">
            <p className="text-violet-100 text-xs font-semibold">{t('ledgerDiffTitle')}</p>
            <p className="text-violet-200/70 text-[11px]">
              {t('ledgerDiffHint', {
                types: detail.activeDiffTypes.length > 0 ? detail.activeDiffTypes.join(', ') : '-',
              })}
            </p>
          </div>
        </div>
      )}

      <header className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5 space-y-3">
        <div className="flex items-start gap-3">
          <Swords size={20} className="text-amber-400 mt-1 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-white text-lg sm:text-xl font-bold">{opponentLabel}</h1>
              <BattleResultBadge result={detailDisplayResult} label={outcomeLabel} />
              {mainOpponentBadgeLabel && (
                <span className="inline-flex items-center gap-0.5 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-[10px] text-gray-300">
                  {mainOpponentBadgeLabel}
                </span>
              )}
              <span className="inline-flex items-center gap-0.5 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5 text-[10px] text-amber-200">
                {relationLabel}
              </span>
              {detail.viewPolicy === 'small_or_low_engagement' && (
                <span className="inline-flex items-center gap-0.5 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-[10px] text-gray-300">
                  {policyLabel}
                </span>
              )}
              {detail.matchTotal > 1 && (
                <span
                  className="inline-flex items-center gap-0.5 bg-violet-500/15 border border-violet-500/30 rounded px-1.5 py-0.5 text-[10px] text-violet-300"
                  title={matchSplitLabel}
                >
                  <GitBranch size={10} />
                  {detail.matchIndex}/{detail.matchTotal}
                </span>
              )}
              {detail.isProvisional && (
                <span
                  className="inline-flex items-center gap-0.5 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5 text-[10px] text-amber-300"
                  title={provisionalLabel}
                >
                  <Hourglass size={10} />
                  {provisionalLabel}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-gray-400 text-xs mt-2">
              <span className="inline-flex items-center gap-1">
                <Clock size={11} />
                {formatDateTime(detail.startedAt, timezone)}
              </span>
              {detail.clusterName && (
                <span className="inline-flex items-center gap-1">
                  <MapPin size={11} />
                  {detail.clusterName}
                </span>
              )}
              <span className="inline-flex items-center gap-1 bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-[11px] text-gray-300">
                {sizeLabel}
                <span className="text-gray-500">
                  {detail.homeTeamSize}v{detail.mainOpponentTeamSize}
                </span>
              </span>
              <span className="inline-flex items-center gap-1 bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-[11px] text-gray-300">
                {statusLabel}
              </span>
              <span className="inline-flex items-center gap-1 bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-[11px] text-gray-300">
                {evidenceLabel}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <SideCard
            label={t('sideHome')}
            teamName={detail.homeGuildName}
            allianceName={detail.homeAllianceName}
            teamSize={detail.homeTeamSize}
            kills={detail.homeKills}
            deaths={detail.homeDeaths}
            killFame={detail.homeKillFame}
            highlight
          />
          <SideCard
            label={t('sideOpponent')}
            teamName={opponentLabel}
            allianceName={null}
            teamSize={detail.mainOpponentTeamSize}
            kills={detail.mainOpponentKills}
            deaths={detail.mainOpponentDeaths}
            killFame={detail.mainOpponentKillFame}
          />
        </div>
        {detail.homeAllianceStats && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
            <div className="flex items-center gap-2">
              <Flag size={12} className="text-amber-300/80 flex-shrink-0" />
              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-300/80">
                {t('homeAllianceTitle')}
              </p>
              <span className="text-[10px] text-gray-500">
                {t('homeAllianceGuildCount', { count: detail.homeAllianceStats.guildCount })}
              </span>
            </div>
            <p className="text-white text-sm font-bold truncate mt-0.5">
              [{detail.homeAllianceStats.allianceName}]
            </p>
            <div className="flex items-center gap-3 mt-1 text-xs font-mono">
              <span className="text-gray-400">{detail.homeAllianceStats.teamSize}p</span>
              <span>
                <span className="text-emerald-400">{detail.homeAllianceStats.kills}</span>
                <span className="text-gray-600">/</span>
                <span className="text-red-400">{detail.homeAllianceStats.deaths}</span>
              </span>
              <span className="text-gray-500">{formatFame(detail.homeAllianceStats.killFame)}</span>
            </div>
            <div className="mt-2 border-t border-amber-500/15 pt-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                {t('homeAllianceGuildsTitle')}
              </p>
              <ul className="mt-1 space-y-1">
                {detail.homeAllianceGuilds.map((guild) => (
                  <li
                    key={guild.guildId}
                    className={`flex items-center gap-2 rounded px-1.5 py-1 text-xs font-mono ${
                      guild.isHomeGuild ? 'bg-amber-500/10' : 'bg-gray-950/30'
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate text-gray-300">{guild.guildName}</span>
                    <span className="text-gray-500">{guild.teamSize}p</span>
                    <span>
                      <span className="text-emerald-400">{guild.kills}</span>
                      <span className="text-gray-600">/</span>
                      <span className="text-red-400">{guild.deaths}</span>
                    </span>
                    <span className="hidden text-gray-500 sm:inline">{formatFame(guild.killFame)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-[10px] text-gray-500 mt-1">{t('homeAllianceHint')}</p>
          </div>
        )}
      </header>

      <section className="space-y-2">
        <h2 className="text-white font-bold text-sm flex items-center gap-1.5">
          <GitBranch size={14} className="text-amber-400" />
          {t('forceEngagementsTitle', { count: detail.forceEngagements.length })}
        </h2>
        {detail.forceEngagements.length === 0 ? (
          <p className="text-gray-500 text-xs">{t('forceEngagementsEmpty')}</p>
        ) : (
          <>
            <p className="text-gray-500 text-[11px]">{t('forceEngagementsHint')}</p>
            <ul className="space-y-1.5">
              {detail.forceEngagements.map((edge) => (
                <ForceEngagementRow
                  key={`${edge.forceLevel}:${edge.forceAKey}:${edge.forceBKey}`}
                  edge={edge}
                  displayResultLabels={displayResultLabels}
                  levelLabel={
                    edge.forceLevel === 'alliance'
                      ? t('forceLevelAlliance')
                      : t('forceLevelGuild')
                  }
                  eventCountLabel={t('forceEngagementEventCount', {
                    count: edge.eventCount,
                  })}
                />
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-white font-bold text-sm flex items-center gap-1.5">
          <Shield size={14} className="text-amber-400" />
          {t('opponentGuildsTitle', { count: detail.opponentGuilds.length })}
        </h2>
        {detail.opponentGuilds.length === 0 ? (
          <p className="text-gray-500 text-xs">{t('opponentGuildsEmpty')}</p>
        ) : (
          <>
            <p className="text-gray-500 text-[11px]">{t('opponentGuildsHint')}</p>
            <ul className="space-y-1.5">
              {detail.opponentGuilds.map((g) => (
                <li
                  key={g.guildId}
                  className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 flex items-center gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-sm font-semibold truncate">{g.guildName}</p>
                    {g.allianceName && (
                      <p className="text-amber-300/80 text-[10px] truncate">[{g.allianceName}]</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs font-mono flex-shrink-0">
                    <span className="text-gray-400">
                      {t('opponentGuildTeamSize', { count: g.teamSize })}
                    </span>
                    <span>
                      <span className="text-emerald-400">{g.kills}</span>
                      <span className="text-gray-600">/</span>
                      <span className="text-red-400">{g.deaths}</span>
                    </span>
                    <span className="text-gray-500">
                      {t('opponentGuildKillFame', { fame: formatFame(g.killFame) })}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-white font-bold text-sm flex items-center gap-1.5">
          <Users size={14} className="text-amber-400" />
          {t('playersTitle', { count: detail.players.length })}
        </h2>
        {detail.players.length === 0 ? (
          <p className="text-gray-500 text-xs">{t('playersEmpty')}</p>
        ) : (
          <>
            <p className="text-gray-500 text-[11px]">{t('playersHint')}</p>
            <ul className="space-y-1.5">
              {playerGuildGroups.map((group) => (
                <PlayerGuildGroupRow
                  key={group.guildKey}
                  group={group}
                  locale={locale}
                  averageIpLabel={(value) => t('playerGuildAverageIp', { value })}
                  averageIpUnknownLabel={t('playerGuildAverageIpUnknown')}
                  weaponUnknownLabel={t('playerWeaponUnknown')}
                  playerIpLabel={(value) => t('playerIp', { value })}
                  playerIpUnknownLabel={t('playerIpUnknown')}
                />
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-white font-bold text-sm flex items-center gap-1.5">
          <Sword size={14} className="text-amber-400" />
          {t('participantsTitle', { count: participants.length })}
        </h2>
        {participants.length === 0 ? (
          <p className="text-gray-500 text-xs">{t('participantsEmpty')}</p>
        ) : (
          <ul className="space-y-2">
            {participants.map((p) => (
              <ParticipantRow
                key={p.key}
                participant={p}
                anonymized={detail.anonymized}
                killLabel={(count) => t('participantKills', { count })}
                deathLabel={(count) => t('participantDeaths', { count })}
                rolekillerLabel={t('roleKiller')}
                roleVictimLabel={t('roleVictim')}
                opponentLabel={(name) => t('eventOpponent', { name })}
                opponentUnknownLabel={t('eventOpponentUnknown')}
                itemPowerLabel={(value) => t('eventItemPower', { value })}
                fameLabel={(fame) => t('eventFame', { fame })}
                timezone={timezone}
                highlightedEventId={highlightedEventId}
              />
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

function ForceEngagementRow({
  edge,
  displayResultLabels,
  levelLabel,
  eventCountLabel,
}: {
  edge: BattleForceEngagement
  displayResultLabels: Record<GuildBattleDisplayResult, string>
  levelLabel: string
  eventCountLabel: string
}) {
  return (
    <li className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200">
          {levelLabel}
        </span>
        {edge.perspectiveResult && (
          <BattleResultBadge
            result={edge.perspectiveResult}
            label={displayResultLabels[edge.perspectiveResult]}
            className="px-1.5 text-[10px]"
            iconSize={10}
          />
        )}
        <p className="min-w-0 flex-1 text-sm font-semibold text-white truncate">
          {edge.forceAName}
          <span className="mx-1.5 text-gray-600">vs</span>
          {edge.forceBName}
        </p>
        <span className="text-[10px] text-gray-500 flex-shrink-0">{eventCountLabel}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
        <ForceMiniStat
          name={edge.forceAName}
          teamSize={edge.forceATeamSize}
          kills={edge.aKills}
          deaths={edge.aDeaths}
          killFame={edge.aKillFame}
        />
        <ForceMiniStat
          name={edge.forceBName}
          teamSize={edge.forceBTeamSize}
          kills={edge.bKills}
          deaths={edge.bDeaths}
          killFame={edge.bKillFame}
        />
      </div>
    </li>
  )
}

function ForceMiniStat({
  name,
  teamSize,
  kills,
  deaths,
  killFame,
}: {
  name: string
  teamSize: number
  kills: number
  deaths: number
  killFame: number
}) {
  return (
    <div className="min-w-0 rounded border border-gray-800 bg-gray-950/40 px-2 py-1">
      <p className="text-[10px] text-gray-500 truncate">{name}</p>
      <div className="flex items-center gap-2">
        <span className="text-gray-400">{teamSize}p</span>
        <span>
          <span className="text-emerald-400">{kills}</span>
          <span className="text-gray-600">/</span>
          <span className="text-red-400">{deaths}</span>
        </span>
        <span className="text-gray-500 truncate">{formatFame(killFame)}</span>
      </div>
    </div>
  )
}

function formatWeaponLabel(
  weaponId: string | null,
  locale: Locale,
  fallback: string,
): string {
  if (!weaponId) return fallback
  return getLocalizedItemNameWithEnchant(weaponId, locale, weaponId) ?? weaponId
}

type BattlePlayer = BattleDetail['players'][number]

interface PlayerGuildGroup {
  guildKey: string
  guildName: string
  allianceName: string | null
  players: BattlePlayer[]
  teamSize: number
  kills: number
  deaths: number
  killFame: number
  averageItemPower: number | null
  topWeapons: Array<{ weaponId: string; count: number }>
  defaultOpen: boolean
}

function groupPlayersByGuild({
  players,
  homeGuildName,
  mainOpponentName,
  primaryOpponentName,
}: {
  players: BattlePlayer[]
  homeGuildName: string
  mainOpponentName: string
  primaryOpponentName: string | null
}): PlayerGuildGroup[] {
  const map = new Map<string, PlayerGuildGroup>()

  for (const player of players) {
    const guildKey = player.guildId || `${player.guildName}:${player.allianceName ?? ''}`
    let group = map.get(guildKey)
    if (!group) {
      group = {
        guildKey,
        guildName: player.guildName,
        allianceName: player.allianceName,
        players: [],
        teamSize: 0,
        kills: 0,
        deaths: 0,
        killFame: 0,
        averageItemPower: null,
        topWeapons: [],
        defaultOpen: false,
      }
      map.set(guildKey, group)
    }

    group.players.push(player)
    group.teamSize += 1
    group.kills += player.kills
    group.deaths += player.deaths
    group.killFame += player.killFame
  }

  const groups = Array.from(map.values())
  for (const group of groups) {
    group.players.sort(compareBattlePlayers)

    const itemPowers = group.players
      .map((p) => p.itemPower)
      .filter((value): value is number => value !== null)
    group.averageItemPower =
      itemPowers.length > 0
        ? Math.round(itemPowers.reduce((sum, value) => sum + value, 0) / itemPowers.length)
        : null

    const weaponCounts = new Map<string, number>()
    for (const player of group.players) {
      if (!player.weaponId) continue
      weaponCounts.set(player.weaponId, (weaponCounts.get(player.weaponId) ?? 0) + 1)
    }
    group.topWeapons = Array.from(weaponCounts, ([weaponId, count]) => ({ weaponId, count }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count
        return a.weaponId.localeCompare(b.weaponId)
      })
      .slice(0, 2)
  }

  groups.sort((a, b) => {
    const aPriority = getPlayerGuildPriority(a, homeGuildName, mainOpponentName, primaryOpponentName)
    const bPriority = getPlayerGuildPriority(b, homeGuildName, mainOpponentName, primaryOpponentName)
    if (aPriority !== bPriority) return aPriority - bPriority
    if (b.teamSize !== a.teamSize) return b.teamSize - a.teamSize
    if (b.kills !== a.kills) return b.kills - a.kills
    return a.guildName.localeCompare(b.guildName)
  })

  const mainOpponentGroup = groups.find(
    (g) =>
      g.guildName !== homeGuildName &&
      (g.guildName === mainOpponentName ||
        g.allianceName === mainOpponentName ||
        (primaryOpponentName !== null && g.guildName === primaryOpponentName)),
  )
  for (const group of groups) {
    group.defaultOpen =
      group.guildName === homeGuildName ||
      (mainOpponentGroup !== undefined && group.guildKey === mainOpponentGroup.guildKey)
  }

  return groups
}

function getPlayerGuildPriority(
  group: PlayerGuildGroup,
  homeGuildName: string,
  mainOpponentName: string,
  primaryOpponentName: string | null,
): number {
  if (group.guildName === homeGuildName) return 0
  if (primaryOpponentName !== null && group.guildName === primaryOpponentName) return 1
  if (group.guildName === mainOpponentName || group.allianceName === mainOpponentName) return 2
  return 3
}

function compareBattlePlayers(a: BattlePlayer, b: BattlePlayer): number {
  if (b.kills !== a.kills) return b.kills - a.kills
  if (b.deaths !== a.deaths) return b.deaths - a.deaths
  if ((b.itemPower ?? 0) !== (a.itemPower ?? 0)) return (b.itemPower ?? 0) - (a.itemPower ?? 0)
  return a.playerName.localeCompare(b.playerName)
}

function PlayerGuildGroupRow({
  group,
  locale,
  averageIpLabel,
  averageIpUnknownLabel,
  weaponUnknownLabel,
  playerIpLabel,
  playerIpUnknownLabel,
}: {
  group: PlayerGuildGroup
  locale: Locale
  averageIpLabel: (value: number) => string
  averageIpUnknownLabel: string
  weaponUnknownLabel: string
  playerIpLabel: (value: number) => string
  playerIpUnknownLabel: string
}) {
  const topWeaponLabels =
    group.topWeapons.length > 0
      ? group.topWeapons
          .map(
            ({ weaponId, count }) =>
              `${formatWeaponLabel(weaponId, locale, weaponUnknownLabel)} x${count}`,
          )
          .join(' · ')
      : weaponUnknownLabel

  return (
    <li className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      <details className="group" open={group.defaultOpen}>
        <summary className="cursor-pointer list-none hover:bg-gray-800/40 transition-colors">
          <div className="flex items-start gap-3 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-white text-sm font-semibold truncate">{group.guildName}</p>
              {group.allianceName && (
                <p className="text-amber-300/80 text-[10px] truncate">[{group.allianceName}]</p>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs font-mono flex-shrink-0">
              <span className="text-gray-400">{group.teamSize}p</span>
              <span>
                <span className="text-emerald-400">{group.kills}</span>
                <span className="text-gray-600">/</span>
                <span className="text-red-400">{group.deaths}</span>
              </span>
              <span className="hidden sm:inline text-gray-500">{formatFame(group.killFame)}</span>
              <ChevronDown
                size={16}
                className="text-gray-500 transition-transform group-open:rotate-180"
              />
            </div>
          </div>
          <div className="grid gap-1 border-t border-gray-800/70 px-3 py-2 text-[11px] text-gray-500 sm:grid-cols-[8rem_minmax(0,1fr)]">
            <span className="font-mono">
              {group.averageItemPower === null
                ? averageIpUnknownLabel
                : averageIpLabel(group.averageItemPower)}
            </span>
            <span className="truncate">{topWeaponLabels}</span>
          </div>
        </summary>
        <div className="border-t border-gray-800">
          <ul className="max-h-80 divide-y divide-gray-800 overflow-y-auto">
            {group.players.map((p) => (
              <li
                key={p.playerId}
                className="grid gap-2 px-3 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_minmax(10rem,14rem)_auto]"
              >
                <div className="min-w-0">
                  <p className="text-white text-sm font-semibold truncate">{p.playerName}</p>
                  <p className="text-gray-500 text-[10px] truncate">
                    {p.guildName}
                    {p.allianceName ? ` [${p.allianceName}]` : ''}
                  </p>
                </div>
                <div className="min-w-0 text-gray-300 truncate">
                  {formatWeaponLabel(p.weaponId, locale, weaponUnknownLabel)}
                </div>
                <div className="flex items-center gap-3 font-mono sm:justify-end">
                  <span>
                    <span className="text-emerald-400">{p.kills}</span>
                    <span className="text-gray-600">/</span>
                    <span className="text-red-400">{p.deaths}</span>
                  </span>
                  <span className="text-gray-400">
                    {p.itemPower === null ? playerIpUnknownLabel : playerIpLabel(p.itemPower)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </details>
    </li>
  )
}

interface Participant {
  // self: discord_id, cross: 익명화로 인해 albion 닉네임을 key 로 쓴다.
  // 양쪽 모두 React list key 로만 사용.
  key: string
  discordId: string | null
  username: string
  avatar: string | null
  kills: number
  deaths: number
  events: BattleKillEvent[]
}

function groupByMember(events: BattleKillEvent[]): Participant[] {
  const map = new Map<string, Participant>()
  for (const e of events) {
    // anonymized 모드는 discord_id 가 null 이므로 albion 닉네임(=username) 으로
    // 묶는다. 같은 닉네임의 두 멤버가 같은 전투에 잡힐 가능성은 매우 낮음.
    const key = e.discord_id ?? `albion:${e.username}`
    let p = map.get(key)
    if (!p) {
      p = {
        key,
        discordId: e.discord_id,
        username: e.username,
        avatar: e.avatar,
        kills: 0,
        deaths: 0,
        events: [],
      }
      map.set(key, p)
    }
    if (e.role === 'killer') p.kills++
    else if (e.role === 'victim') p.deaths++
    p.events.push(e)
  }
  // 킬 많은 순 → 데스 많은 순 → username
  return Array.from(map.values()).sort((a, b) => {
    if (b.kills !== a.kills) return b.kills - a.kills
    if (b.deaths !== a.deaths) return b.deaths - a.deaths
    return a.username.localeCompare(b.username)
  })
}

interface SideCardProps {
  label: string
  teamName: string
  allianceName: string | null
  teamSize: number
  kills: number
  deaths: number
  killFame: number
  highlight?: boolean
}

function SideCard({
  label,
  teamName,
  allianceName,
  teamSize,
  kills,
  deaths,
  killFame,
  highlight = false,
}: SideCardProps) {
  const ringClass = highlight ? 'border-amber-500/40 bg-amber-500/5' : 'border-gray-800 bg-gray-950/40'
  return (
    <div className={`rounded-lg border px-3 py-2 ${ringClass}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </p>
      <p className="text-white text-sm font-bold truncate">{teamName}</p>
      {allianceName && (
        <p className="text-amber-300/80 text-[10px] truncate">[{allianceName}]</p>
      )}
      <div className="flex items-center gap-3 mt-1 text-xs font-mono">
        <span className="text-gray-400">{teamSize}p</span>
        <span>
          <span className="text-emerald-400">{kills}</span>
          <span className="text-gray-600">/</span>
          <span className="text-red-400">{deaths}</span>
        </span>
        <span className="text-gray-500">{formatFame(killFame)}</span>
      </div>
    </div>
  )
}

interface ParticipantRowProps {
  participant: Participant
  // cross 시점은 멤버 정보 익명화 — Discord 아바타 fetch 도, /members/[id]
  // 링크도 의미 없으므로 둘 다 끈다. UserCircle2 placeholder + 닉네임만 노출.
  anonymized: boolean
  killLabel: (count: number) => string
  deathLabel: (count: number) => string
  rolekillerLabel: string
  roleVictimLabel: string
  opponentLabel: (name: string) => string
  opponentUnknownLabel: string
  itemPowerLabel: (value: number) => string
  fameLabel: (fame: string) => string
  timezone: string
  highlightedEventId?: string
}

function ParticipantRow({
  participant,
  anonymized,
  killLabel,
  deathLabel,
  rolekillerLabel,
  roleVictimLabel,
  opponentLabel,
  opponentUnknownLabel,
  itemPowerLabel,
  fameLabel,
  timezone,
  highlightedEventId,
}: ParticipantRowProps) {
  const hasHighlightedEvent = !!highlightedEventId &&
    participant.events.some((event) => event.event_id === highlightedEventId)
  return (
    <li className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      {/* native <details> 로 접힘/펼침 상태 관리. summary 는 아바타+유저명+K/D
          요약 한 줄, 펼치면 아래 이벤트 리스트가 드러남. list-none 으로
          기본 삼각형을 지우고 우측 ChevronDown 이 open 시 180° 회전. */}
      <details className="group" open={hasHighlightedEvent || undefined}>
        <summary className="flex items-center gap-3 p-3 cursor-pointer list-none hover:bg-gray-800/40 transition-colors">
          {anonymized || !participant.discordId ? (
            <span className="w-8 h-8 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center flex-shrink-0">
              <UserCircle2 size={20} className="text-gray-500" />
            </span>
          ) : (
            <MemberAvatar
              discordId={participant.discordId}
              avatar={participant.avatar}
              size={32}
            />
          )}
          <div className="min-w-0 flex-1">
            <span className="text-white text-sm font-semibold truncate block">
              {participant.username}
            </span>
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="text-emerald-400">{killLabel(participant.kills)}</span>
              <span className="text-red-400">{deathLabel(participant.deaths)}</span>
            </div>
          </div>
          {!anonymized && participant.discordId && (
            <Link
              href={`/members/${participant.discordId}`}
              className="text-gray-500 hover:text-amber-300 text-[10px] font-mono flex-shrink-0"
            >
              →
            </Link>
          )}
          <ChevronDown
            size={16}
            className="text-gray-500 flex-shrink-0 transition-transform group-open:rotate-180"
          />
        </summary>
        <ul className="border-t border-gray-800 px-3 py-2 space-y-1 pl-11">
          {participant.events.map((e) => {
            const isKiller = e.role === 'killer'
            const roleBadgeClass = isKiller
              ? 'bg-emerald-500/20 text-emerald-300'
              : 'bg-red-500/20 text-red-300'
            const opponent = e.opponent_name
              ? opponentLabel(
                  formatOpponentLabel(
                    e.opponent_name,
                    e.opponent_guild,
                    e.opponent_alliance,
                  ),
                )
              : opponentUnknownLabel
            return (
              <li
                key={`${e.event_id}-${e.role}`}
                id={`killbot-event-${e.event_id}`}
                className={`scroll-mt-24 rounded px-1 py-0.5 flex items-center gap-2 text-xs ${
                  e.event_id === highlightedEventId
                    ? 'bg-amber-500/15 ring-1 ring-amber-500/40'
                    : ''
                }`}
              >
                <span
                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${roleBadgeClass}`}
                >
                  {isKiller ? rolekillerLabel : roleVictimLabel}
                </span>
                <span className="text-gray-300 truncate flex-1">{opponent}</span>
                <span className="text-gray-500 font-mono text-[10px] flex-shrink-0">
                  {formatTime(e.occurred_at, timezone)}
                  {e.item_power != null && (
                    <span className="ml-2">{itemPowerLabel(e.item_power)}</span>
                  )}
                  <span className="ml-2">{fameLabel(e.fame.toLocaleString())}</span>
                </span>
              </li>
            )
          })}
        </ul>
      </details>
    </li>
  )
}

function formatFame(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}
