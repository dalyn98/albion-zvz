import Link from 'next/link'
import {
  Coins,
  Wallet,
  ShieldCheck,
  ShieldAlert,
  ChevronRight,
  Sword,
  Skull,
  Flame,
  TrendingUp,
  Heart,
  CalendarCheck,
  Trophy,
  Crown,
  Shield,
  Target,
  Video,
  ExternalLink,
} from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import MemberAvatar from './MemberAvatar'
import LanguageBadge from './LanguageBadge'
import ItemImage from './ItemImage'
import BadgeGrid from './BadgeGrid'
import RefreshAlbionIdentityButton from './RefreshAlbionIdentityButton'
import CollapsibleList from './CollapsibleList'
import { formatSilver } from '@/lib/silver'
import { formatDate, formatDateTime } from '@/lib/format-datetime'
import { getLocalizedItemName } from '@/lib/item-names'
import { canonicalT8WeaponId } from '@/lib/weapon-display'
import { ALBION_SERVER_LABEL_KEY } from '@/lib/albion-gameinfo'
import {
  canUseGuildResourceFeatures,
  type AlbionIdentityRelation,
  type AlbionIdentityTrustStatus,
} from '@/lib/account-albion-identity'
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales'
import { DEFAULT_TENANT_TIMEZONE } from '@/lib/timezone'
import { getRoleStyle, regearPayoutSilver } from '@/types'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import type {
  GuildMemberDetail,
  MemberExchangeEntry,
  MemberKillEvent,
} from '@/app/actions/members-admin'

const STATUS_CLASS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-300',
  approved: 'bg-green-500/20 text-green-300',
  rejected: 'bg-gray-700 text-gray-300',
}

const WEAPON_COLLAPSED_COUNT = 6
const KILL_HISTORY_COLLAPSED_COUNT = 8
const VIDEO_PROOF_COLLAPSED_COUNT = 5
const EVENT_COLLAPSED_COUNT = 8
const REGEAR_COLLAPSED_COUNT = 6
const EXCHANGE_COLLAPSED_COUNT = 6

// 상대 라벨 포맷터: 길드/연합 둘 다 있으면 `Name [Guild] [Alliance]`, 길드만
// 있으면 `Name [Guild]`. 연합은 알비온 API 가 nullable 로 내려주는 필드 (무소속/
// 언게임 캐릭터) 라 부재 시 해당 브래킷만 빠진다.
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

type StatusKey = 'pending' | 'approved' | 'rejected'

interface StatusLabels {
  pending: string
  approved: string
  rejected: string
}

interface Props {
  detail: GuildMemberDetail
  timezone?: string
  // Admin view shows the raw Discord ID under the username; member self-view hides it.
  showDiscordId?: boolean
  // Self profile can trigger the once-per-day Gameinfo refresh.
  allowIdentityRefresh?: boolean
}

export default async function MemberDetailView({
  detail,
  timezone = DEFAULT_TENANT_TIMEZONE,
  showDiscordId = true,
  allowIdentityRefresh = false,
}: Props) {
  const t = await getTranslations('memberDetail')
  const tIdentity = await getTranslations('albionIdentityProfile')
  const tStatus = await getTranslations('status')
  const tRole = await getTranslations('slotRole')
  const tReason = await getTranslations('regearRejectReason')
  const tCommon = await getTranslations('common')
  const rawLocale = await getLocale()
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE
  const statusLabels: StatusLabels = {
    pending: tStatus('pending'),
    approved: tStatus('approved'),
    rejected: tStatus('rejected'),
  }
  const videoProofByRegearId = new Map(
    detail.video_proofs.map((entry) => [entry.id, entry]),
  )
  return (
    <>
      <header className="flex items-center gap-4 bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5">
        <MemberAvatar discordId={detail.discord_id} avatar={detail.avatar} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-white text-lg sm:text-xl font-bold truncate">{detail.username}</h1>
            <LanguageBadge locale={detail.preferred_language} />
          </div>
          {showDiscordId && (
            <p className="text-gray-500 text-xs mt-0.5 font-mono truncate">{detail.discord_id}</p>
          )}
          <p className="text-gray-500 text-xs">{t('recentLogin', { date: formatDate(detail.updated_at, timezone) })}</p>
        </div>
      </header>

      {detail.albion_identity && (
        <AlbionIdentityPanel
          identity={detail.albion_identity}
          timezone={timezone}
          allowRefresh={allowIdentityRefresh}
          t={tIdentity}
          serverLabel={(key) => tCommon(key)}
        />
      )}

      <section className="space-y-3">
        <h2 className="text-white font-bold text-sm flex items-center gap-1.5">
          <TrendingUp size={14} className="text-amber-400" />
          {t('statsSectionTitle')}
        </h2>

        <StatSubGroup label={t('statsGroupBasic')}>
          <StatCard
            icon={<ShieldCheck size={14} className="text-amber-400" />}
            label={t('statTotalParticipation')}
            value={t('participationTimes', { count: detail.participation_count })}
          />
          <StatCard
            icon={<Coins size={14} className="text-amber-400" />}
            label={t('statBalance')}
            value={formatSilver(detail.balance)}
            mono
          />
          <StatCard
            icon={<Coins size={14} className="text-green-400" />}
            label={t('statEarned')}
            value={formatSilver(detail.lifetime_earned)}
            mono
          />
          <StatCard
            icon={<Wallet size={14} className="text-red-400" />}
            label={t('statSpent')}
            value={formatSilver(detail.lifetime_spent)}
            mono
          />
        </StatSubGroup>

        <StatSubGroup label={t('statsGroupKillboard')}>
          <StatCard
            icon={<Sword size={14} className="text-red-400" />}
            label={t('statKills')}
            value={detail.killboard.kills.toLocaleString()}
            mono
          />
          <StatCard
            icon={<Skull size={14} className="text-gray-400" />}
            label={t('statDeaths')}
            value={detail.killboard.deaths.toLocaleString()}
            mono
          />
          <StatCard
            icon={<Flame size={14} className="text-orange-400" />}
            label={t('statKillFame')}
            value={detail.killboard.kill_fame.toLocaleString()}
            mono
          />
          <StatCard
            icon={<Flame size={14} className="text-gray-500" />}
            label={t('statDeathFame')}
            value={detail.killboard.death_fame.toLocaleString()}
            mono
          />
        </StatSubGroup>

        <StatSubGroup label={t('statsGroupCombat')} cols={5}>
          <StatCard
            icon={<Target size={14} className="text-amber-400" />}
            label={t('statKd')}
            value={formatKd(detail.killboard.kills, detail.killboard.deaths)}
            mono
          />
          <StatCard
            icon={<Trophy size={14} className="text-amber-400" />}
            label={t('statWinRate')}
            value={formatSurvival(detail.advanced_stats.win_rate)}
            sub={
              detail.advanced_stats.evaluated_outcome_events > 0
                ? t('statWinLossSub', {
                    wins: detail.advanced_stats.wins,
                    losses: detail.advanced_stats.losses,
                  })
                : undefined
            }
            tone={winRateTone(detail.advanced_stats.win_rate)}
            mono
          />
          <StatCard
            icon={<Heart size={14} className="text-emerald-400" />}
            label={t('statSurvival')}
            value={formatSurvival(detail.advanced_stats.survival_rate)}
            sub={
              detail.advanced_stats.evaluated_events > 0
                ? t('statSurvivalSub', { count: detail.advanced_stats.evaluated_events })
                : undefined
            }
            tone={survivalTone(detail.advanced_stats.survival_rate)}
            mono
          />
          <StatCard
            icon={<Shield size={14} className="text-cyan-400" />}
            label={t('statDeathless')}
            value={t('statStreakUnit', { count: detail.advanced_stats.deathless_current_streak })}
            sub={t('statStreakLongest', {
              count: detail.advanced_stats.deathless_longest_streak,
            })}
            mono
          />
          <StatCard
            icon={<CalendarCheck size={14} className="text-amber-400" />}
            label={t('statParticipationStreak')}
            value={t('statStreakDays', {
              count: detail.advanced_stats.participation_current_streak,
            })}
            sub={t('statStreakLongestDays', {
              count: detail.advanced_stats.participation_longest_streak,
            })}
            mono
          />
        </StatSubGroup>

        <StatSubGroup label={t('statsGroupActivity')} cols={3}>
          <StatCard
            icon={<Shield size={14} className="text-amber-400" />}
            label={t('statRegearCount')}
            value={t('participationTimes', { count: detail.regears.length })}
          />
          <StatCard
            icon={<Crown size={14} className="text-red-400" />}
            label={t('statKillRank')}
            value={formatRankPercentile(
              detail.advanced_stats.kill_rank_percentile,
              t('valueNone'),
              (percent) => t('statRankPercentile', { percent }),
            )}
            sub={formatRankSub(
              detail.advanced_stats.kill_rank,
              detail.advanced_stats.kill_rank_total,
              (rank, total) => t('statRankSub', { rank, total }),
            )}
            mono
          />
          <StatCard
            icon={<Trophy size={14} className="text-amber-400" />}
            label={t('statParticipationRank')}
            value={formatRankPercentile(
              detail.advanced_stats.participation_rank_percentile,
              t('valueNone'),
              (percent) => t('statRankPercentile', { percent }),
            )}
            sub={formatRankSub(
              detail.advanced_stats.participation_rank,
              detail.advanced_stats.participation_rank_total,
              (rank, total) => t('statRankSub', { rank, total }),
            )}
            mono
          />
        </StatSubGroup>
      </section>

      <BadgeGrid
        input={{
          participationCount: detail.participation_count,
          kills: detail.killboard.kills,
          deathlessLongestStreak: detail.advanced_stats.deathless_longest_streak,
          survivalRate: detail.advanced_stats.survival_rate,
          evaluatedEvents: detail.advanced_stats.evaluated_events,
          participationLongestStreak: detail.advanced_stats.participation_longest_streak,
          wins: detail.advanced_stats.wins,
        }}
      />

      <section className="space-y-2">
        <h2 className="text-white font-bold text-sm">{t('roleBreakdown')}</h2>
        {detail.role_breakdown.length === 0 ? (
          <p className="text-gray-500 text-xs">{t('noSlotHistory')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {detail.role_breakdown.map((r) => {
              const style = getRoleStyle(r.role)
              return (
                <span
                  key={r.role}
                  className={`text-xs font-semibold px-2 py-1 rounded ${
                    style?.badge ?? 'bg-gray-700 text-gray-300'
                  }`}
                >
                  {translateSlotRole(r.role, tRole)} · {r.count}
                </span>
              )
            })}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-white font-bold text-sm flex items-center gap-1.5">
          <Sword size={14} className="text-amber-400" />
          {t('weaponUsage')}
        </h2>
        {detail.weapon_breakdown.length === 0 ? (
          <p className="text-gray-500 text-xs">{t('noWeaponUsage')}</p>
        ) : (
          <CollapsibleList
            className="grid grid-cols-1 sm:grid-cols-2 gap-2"
            initialCount={WEAPON_COLLAPSED_COUNT}
            unit="items"
          >
            {detail.weapon_breakdown.map((w, idx) => {
              // 샘플은 T6_MAIN_HOLYSTAFF_AVALON@1 처럼 티어/인챈트가 섞여 있어
              // 그대로 로컬라이즈하면 "마스터의 할로우폴@1" 같은 중구난방 표기가
              // 된다. 통계 뷰에서는 T8.0 canonical 로 정규화해서 "장로의 할로우폴"
              // 처럼 무기군 당 한 가지 표기로 수렴시킨다 (icon 도 동일).
              const canonicalId = canonicalT8WeaponId(w.weapon_id)
              const localized = canonicalId
                ? getLocalizedItemName(canonicalId, locale, null)
                : null
              const displayId = localized ? canonicalId : w.weapon_id
              const displayName = localized ?? w.weapon_name
              return (
                <li
                  key={`${displayId ?? 'free'}-${idx}`}
                  className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2"
                >
                  <ItemImage itemId={displayId} itemName={displayName} size={36} hoverPreview />
                  <span className="text-white text-sm truncate flex-1">{displayName}</span>
                  <span className="text-amber-300 text-xs font-mono font-bold flex-shrink-0">
                    {t('weaponUsageCount', { count: w.count })}
                  </span>
                </li>
              )
            })}
          </CollapsibleList>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-white font-bold text-sm flex items-center gap-1.5">
          <Sword size={14} className="text-red-400" />
          {t('killHistoryTitle', { count: detail.kill_history.length })}
        </h2>
        {detail.kill_history.length === 0 ? (
          <p className="text-gray-500 text-xs">{t('killHistoryEmpty')}</p>
        ) : (
          <CollapsibleList
            className="space-y-1.5"
            initialCount={KILL_HISTORY_COLLAPSED_COUNT}
            unit="items"
          >
            {detail.kill_history.map((k) => (
              <KillHistoryRow
                key={`${k.event_id}-${k.role}`}
                entry={k}
                roleLabel={
                  k.role === 'killer' ? t('killRoleKiller') : t('killRoleVictim')
                }
                opponentLabel={(name) => t('killOpponent', { name })}
                opponentUnknownLabel={t('killOpponentUnknown')}
                itemPowerLabel={(value) => t('killItemPower', { value })}
                fameLabel={(fame) => t('killFameLabel', { fame })}
                timezone={timezone}
              />
            ))}
          </CollapsibleList>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-white font-bold text-sm flex items-center gap-1.5">
          <Video size={14} className="text-sky-400" />
          {t('videoProofHistory', { count: detail.video_proofs.length })}
        </h2>
        {detail.video_proofs.length === 0 ? (
          <p className="text-gray-500 text-xs">{t('noVideoProofs')}</p>
        ) : (
          <CollapsibleList
            className="space-y-2"
            initialCount={VIDEO_PROOF_COLLAPSED_COUNT}
            unit="items"
          >
            {detail.video_proofs.map((proof) => {
              const proofTitle = proof.video_proof_title?.trim() || t('videoProofFallbackTitle')
              return (
                <li key={proof.id}>
                  <a
                    href={proof.watch_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 bg-gray-900 border border-gray-800 hover:border-sky-500/40 hover:bg-gray-800/60 rounded-lg px-3 py-2 transition-colors group"
                    title={t('videoProofOpen')}
                  >
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-300">
                      <Video size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-white text-sm font-medium truncate">
                        {proofTitle}
                      </span>
                      <span className="block text-gray-500 text-[11px] truncate">
                        {proof.event_title}
                        {proof.role_name && (
                          <span className="ml-1.5">
                            · {translateSlotRole(proof.role_name, tRole)}
                          </span>
                        )}
                        <span className="ml-1.5 font-mono">
                          · {formatDateTime(proof.created_at, timezone)}
                        </span>
                      </span>
                    </span>
                    <ExternalLink size={14} className="text-gray-600 group-hover:text-sky-300 flex-shrink-0" />
                  </a>
                </li>
              )
            })}
          </CollapsibleList>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-white font-bold text-sm">{t('participatedEvents', { count: detail.events.length })}</h2>
        {detail.events.length === 0 ? (
          <p className="text-gray-500 text-xs">{t('noEvents')}</p>
        ) : (
          <CollapsibleList
            className="space-y-2"
            initialCount={EVENT_COLLAPSED_COUNT}
            unit="items"
          >
            {detail.events.map((e) => {
              const style = getRoleStyle(e.role)
              const whenIso = e.battle_started_at ?? e.gather_at ?? e.created_at
              return (
                <li key={e.event_id}>
                  <Link
                    href={`/events/${e.event_id}`}
                    className="flex items-center gap-3 bg-gray-900 border border-gray-800 hover:border-gray-700 hover:bg-gray-800/60 rounded-lg px-3 py-2 transition-colors group"
                  >
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${
                        style?.badge ?? 'bg-gray-700 text-gray-300'
                      }`}
                    >
                      {translateSlotRole(e.role, tRole)}
                    </span>
                    <span className="text-white text-sm truncate flex-1">{e.event_title}</span>
                    <span className="text-gray-500 text-xs font-mono flex-shrink-0">
                      {formatDate(whenIso, timezone)}
                    </span>
                    <ChevronRight size={14} className="flex-shrink-0 text-gray-600 transition-[color,transform] duration-150 ease-out group-hover:translate-x-0.5 group-hover:text-gray-300" />
                  </Link>
                </li>
              )
            })}
          </CollapsibleList>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-white font-bold text-sm">{t('regearHistory', { count: detail.regears.length })}</h2>
        {detail.regears.length === 0 ? (
          <p className="text-gray-500 text-xs">{t('noRegears')}</p>
        ) : (
          <CollapsibleList
            className="space-y-2"
            initialCount={REGEAR_COLLAPSED_COUNT}
            unit="items"
          >
            {detail.regears.map((r) => {
              const statusKey = r.status as StatusKey
              const videoProof = videoProofByRegearId.get(r.id)
              return (
                <li
                  key={r.id}
                  className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-white text-sm font-medium truncate">{r.event_title}</p>
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${STATUS_CLASS[statusKey]}`}
                    >
                      {statusLabels[statusKey]}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap text-xs text-gray-400">
                    <span>{r.role_name ? translateSlotRole(r.role_name, tRole) : ''}</span>
                    <span className="font-mono text-amber-400">
                      {t('claimedAmount', { amount: formatSilver(regearPayoutSilver(r)) })}
                      <span className="text-gray-500"> / {t('ceilingAmount', { amount: formatSilver(r.silver) })}</span>
                    </span>
                    {videoProof && (
                      <a
                        href={videoProof.watch_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-w-0 max-w-full items-center gap-1 rounded bg-sky-500/10 px-1.5 py-0.5 font-semibold text-sky-300 hover:bg-sky-500/20"
                        title={t('videoProofOpen')}
                      >
                        <Video size={11} className="shrink-0" />
                        <span className="truncate">
                          {videoProof.video_proof_title?.trim() || t('videoProofBadge')}
                        </span>
                      </a>
                    )}
                  </div>
                  <p className="text-gray-600 text-[11px] font-mono">
                    {t('requestedAt', { when: formatDateTime(r.created_at, timezone) })}
                    {r.resolved_at && statusKey !== 'pending' && (
                      <span className="ml-2">
                        · {t('resolvedAt', { status: statusLabels[statusKey], when: formatDateTime(r.resolved_at, timezone) })}
                        {r.handled_by_username && (
                          <span className="ml-1 text-gray-700">
                            · {t('handledBy', { handler: r.handled_by_username })}
                          </span>
                        )}
                      </span>
                    )}
                  </p>
                  {r.reject_reason_code && (
                    <p className="text-[11px] text-red-300">
                      <span className="font-semibold">{t('rejectReasonLabel')}:</span>{' '}
                      {tReason(r.reject_reason_code)}
                    </p>
                  )}
                  {r.admin_notes && (
                    <p className="text-gray-400 text-[11px] italic truncate">{r.admin_notes}</p>
                  )}
                </li>
              )
            })}
          </CollapsibleList>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-white font-bold text-sm">{t('exchangeHistory', { count: detail.exchanges.length })}</h2>
        {detail.exchanges.length === 0 ? (
          <p className="text-gray-500 text-xs">{t('noExchanges')}</p>
        ) : (
          <CollapsibleList
            className="space-y-2"
            initialCount={EXCHANGE_COLLAPSED_COUNT}
            unit="items"
          >
            {detail.exchanges.map((e) => (
              <ExchangeRow
                key={e.id}
                entry={e}
                statusLabels={statusLabels}
                timezone={timezone}
                manualAdjustLabel={t('manualAdjust')}
                adjustedAtLabel={(when) => t('adjustedAt', { when })}
                requestedAtLabel={(when) => t('requestedAt', { when })}
                resolvedAtLabel={(status, when) => t('resolvedAt', { status, when })}
                handledByLabel={(handler) => t('handledBy', { handler })}
              />
            ))}
          </CollapsibleList>
        )}
      </section>
    </>
  )
}

function AlbionIdentityPanel({
  identity,
  timezone,
  allowRefresh,
  t,
  serverLabel,
}: {
  identity: NonNullable<GuildMemberDetail['albion_identity']>
  timezone: string
  allowRefresh: boolean
  t: Awaited<ReturnType<typeof getTranslations>>
  serverLabel: (key: string) => string
}) {
  const resourceTrusted = canUseGuildResourceFeatures({
    relation: identity.relation,
    trustStatus: identity.trustStatus,
  })
  const reviewPending = identity.trustStatus === 'roster_matched'
  const disputed = identity.trustStatus === 'disputed'
  const tone = resourceTrusted
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
    : reviewPending
      ? 'border-sky-500/30 bg-sky-500/10 text-sky-200'
      : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-200'
  const Icon = resourceTrusted ? ShieldCheck : ShieldAlert
  const statusText = t(trustStatusKey(identity.trustStatus))
  const resourceText = resourceTrusted
    ? t('resourceTrusted')
    : reviewPending
      ? t('resourceReview')
      : disputed
        ? t('resourceDisputed')
        : t('resourceBlocked')

  return (
    <section className={`rounded-xl border p-4 space-y-3 ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex items-start gap-2">
          <Icon size={18} className="mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{t('title')}</h2>
            <p className="text-xs leading-relaxed opacity-85">{resourceText}</p>
          </div>
        </div>
        {allowRefresh && identity.playerId && <RefreshAlbionIdentityButton />}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        <IdentityField label={t('character')} value={identity.nickname ?? t('unknownValue')} />
        <IdentityField
          label={t('server')}
          value={identity.server ? serverLabel(ALBION_SERVER_LABEL_KEY[identity.server]) : t('unknownValue')}
        />
        <IdentityField label={t('status')} value={statusText} />
        <IdentityField label={t('relation')} value={t(relationKey(identity.relation))} />
        <IdentityField
          label={t('currentGuild')}
          value={identity.currentGuildName ?? t('unknownValue')}
        />
        <IdentityField
          label={t('currentAlliance')}
          value={identity.currentAllianceName ?? t('noAlliance')}
        />
        <IdentityField
          label={t('lastSynced')}
          value={identity.lastSyncedAt ? formatDateTime(identity.lastSyncedAt, timezone) : t('notSynced')}
        />
        <IdentityField
          label={t('trustedAt')}
          value={identity.trustedAt ? formatDateTime(identity.trustedAt, timezone) : t('notTrusted')}
        />
      </div>
    </section>
  )
}

function IdentityField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-white/10 bg-black/10 px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wide opacity-60">{label}</p>
      <p className="mt-0.5 truncate font-medium">{value}</p>
    </div>
  )
}

function trustStatusKey(status: AlbionIdentityTrustStatus) {
  const keys: Record<AlbionIdentityTrustStatus, string> = {
    claimed: 'statusClaimed',
    roster_matched: 'statusRosterMatched',
    trusted: 'statusTrusted',
    disputed: 'statusDisputed',
    revoked: 'statusRevoked',
  }
  return keys[status]
}

function relationKey(relation: AlbionIdentityRelation) {
  const keys: Record<AlbionIdentityRelation, string> = {
    home_guild: 'relationHomeGuild',
    alliance: 'relationAlliance',
    external: 'relationExternal',
    unknown: 'relationUnknown',
  }
  return keys[relation]
}

interface ExchangeRowProps {
  entry: MemberExchangeEntry
  statusLabels: StatusLabels
  timezone: string
  manualAdjustLabel: string
  adjustedAtLabel: (when: string) => string
  requestedAtLabel: (when: string) => string
  resolvedAtLabel: (status: string, when: string) => string
  handledByLabel: (handler: string) => string
}

function ExchangeRow({
  entry,
  statusLabels,
  timezone,
  manualAdjustLabel,
  adjustedAtLabel,
  requestedAtLabel,
  resolvedAtLabel,
  handledByLabel,
}: ExchangeRowProps) {
  if (entry.kind === 'admin_adjust') {
    const isGrant = entry.delta > 0
    return (
      <li className="flex items-center justify-between gap-3 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-mono ${isGrant ? 'text-green-300' : 'text-red-300'}`}>
            {isGrant ? '+' : '-'}
            {formatSilver(Math.abs(entry.delta))}
          </p>
          <p className="text-gray-600 text-[11px] font-mono">
            {adjustedAtLabel(formatDateTime(entry.created_at, timezone))}
            {entry.handled_by_username && (
              <span className="ml-1 text-gray-700">
                · {handledByLabel(entry.handled_by_username)}
              </span>
            )}
          </p>
          {entry.memo && (
            <p className="text-gray-400 text-[11px] italic truncate">{entry.memo}</p>
          )}
        </div>
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 bg-amber-500/20 text-amber-300">
          {manualAdjustLabel}
        </span>
      </li>
    )
  }

  const statusKey = entry.status as StatusKey
  return (
    <li className="flex items-center justify-between gap-3 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-white text-sm font-mono">{formatSilver(entry.silver)}</p>
        <p className="text-gray-600 text-[11px] font-mono">
          {requestedAtLabel(formatDateTime(entry.created_at, timezone))}
          {entry.resolved_at && statusKey !== 'pending' && (
            <span className="ml-2">
              · {resolvedAtLabel(statusLabels[statusKey], formatDateTime(entry.resolved_at, timezone))}
              {entry.handled_by_username && (
                <span className="ml-1 text-gray-700">
                  · {handledByLabel(entry.handled_by_username)}
                </span>
              )}
            </span>
          )}
        </p>
        {entry.admin_notes && (
          <p className="text-gray-400 text-[11px] italic truncate">{entry.admin_notes}</p>
        )}
      </div>
      <span
        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${STATUS_CLASS[statusKey]}`}
      >
        {statusLabels[statusKey]}
      </span>
    </li>
  )
}

interface KillHistoryRowProps {
  entry: MemberKillEvent
  roleLabel: string
  opponentLabel: (name: string) => string
  opponentUnknownLabel: string
  itemPowerLabel: (value: number) => string
  fameLabel: (fame: string) => string
  timezone: string
}

function KillHistoryRow({
  entry,
  roleLabel,
  opponentLabel,
  opponentUnknownLabel,
  itemPowerLabel,
  fameLabel,
  timezone,
}: KillHistoryRowProps) {
  const isKiller = entry.role === 'killer'
  const roleBadgeClass = isKiller
    ? 'bg-emerald-500/20 text-emerald-300'
    : 'bg-red-500/20 text-red-300'
  const opponent = entry.opponent_name
    ? opponentLabel(
        formatOpponentLabel(
          entry.opponent_name,
          entry.opponent_guild,
          entry.opponent_alliance,
        ),
      )
    : opponentUnknownLabel
  return (
    <li className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${roleBadgeClass}`}>
        {roleLabel}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-white text-sm truncate">{opponent}</p>
        <p className="text-gray-500 text-[10px] font-mono">
          {formatDateTime(entry.occurred_at, timezone)}
          {entry.item_power != null && (
            <span className="ml-2 text-gray-400">{itemPowerLabel(entry.item_power)}</span>
          )}
          <span className="ml-2 text-gray-400">
            {fameLabel(entry.fame.toLocaleString())}
          </span>
        </p>
      </div>
    </li>
  )
}

type StatTone = 'default' | 'emerald' | 'amber' | 'rose'

function StatCard({
  icon,
  label,
  value,
  sub,
  mono = false,
  tone = 'default',
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  mono?: boolean
  tone?: StatTone
}) {
  const toneClass =
    tone === 'emerald'
      ? 'text-emerald-300'
      : tone === 'amber'
        ? 'text-amber-300'
        : tone === 'rose'
          ? 'text-rose-300'
          : 'text-white'
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-3">
      <div className="flex items-center gap-1.5 text-gray-400 text-[11px] font-semibold uppercase tracking-widest">
        {icon}
        {label}
      </div>
      <p className={`${toneClass} text-base sm:text-lg font-bold mt-1 ${mono ? 'font-mono' : ''}`}>
        {value}
      </p>
      {sub && <p className="text-gray-500 text-[10px] mt-0.5 truncate">{sub}</p>}
    </div>
  )
}

// 통계 섹션의 서브 그룹. cols=4 는 기본, cols=3 은 카드 수가 3일 때 마지막 빈
// 칸이 안 보이게 쓰는 변형. Tailwind 는 동적 클래스를 트리 쉐이킹하지 않으므로
// 두 클래스 문자열을 그대로 나열해야 한다.
function StatSubGroup({
  label,
  cols = 4,
  children,
}: {
  label: string
  cols?: 3 | 4 | 5
  children: React.ReactNode
}) {
  const grid =
    cols === 3
      ? 'grid-cols-2 sm:grid-cols-3'
      : cols === 5
        ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
        : 'grid-cols-2 sm:grid-cols-4'
  return (
    <div className="space-y-1.5">
      <h3 className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider">
        {label}
      </h3>
      <div className={`grid ${grid} gap-2.5`}>{children}</div>
    </div>
  )
}

function formatKd(kills: number, deaths: number): string {
  if (deaths === 0) {
    if (kills === 0) return '-'
    // 죽지 않은 경우 kills 를 그대로 보여주는 게 "퍼펙트" 의 의미 — 무한대 기호
    // 보다 수치가 직관적.
    return `${kills}.00`
  }
  return (kills / deaths).toFixed(2)
}

function formatSurvival(rate: number | null): string {
  if (rate == null) return '-'
  return `${Math.round(rate * 100)}%`
}

function survivalTone(rate: number | null): StatTone {
  if (rate == null) return 'default'
  if (rate >= 0.8) return 'emerald'
  if (rate >= 0.5) return 'amber'
  return 'rose'
}

function winRateTone(rate: number | null): StatTone {
  if (rate == null) return 'default'
  if (rate >= 0.6) return 'emerald'
  if (rate >= 0.4) return 'amber'
  return 'rose'
}

function formatRankPercentile(
  percentile: number | null,
  none: string,
  render: (percent: number) => string,
): string {
  if (percentile == null) return none
  return render(percentile)
}

function formatRankSub(
  rank: number | null,
  total: number,
  render: (rank: number, total: number) => string,
): string | undefined {
  if (rank == null || total === 0) return undefined
  return render(rank, total)
}
