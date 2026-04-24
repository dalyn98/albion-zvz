import Link from 'next/link'
import { Trophy, Skull, Minus, Swords, MapPin, Clock, Sword } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import MemberAvatar from './MemberAvatar'
import { formatDateTime } from '@/lib/format-datetime'
import type { BattleDetail, BattleKillEvent } from '@/app/actions/battles'

// 참가자 카드는 멤버당 "몇 킬 / 몇 데스" 요약만 노출한다. 개별 킬로그(상대·IP·
// fame) 는 멤버 상세 페이지의 "최근 킬/데스" 섹션에서 이미 볼 수 있고, 여기선
// 전투 단위 기여도만 한눈에 보이도록 의도적으로 숨겼다.

interface Props {
  detail: BattleDetail
}

export default async function BattleDetailView({ detail }: Props) {
  const t = await getTranslations('battleDetail')
  const tList = await getTranslations('battleTracking')

  const outcomeLabel =
    detail.outcome === 'win'
      ? tList('outcome_win')
      : detail.outcome === 'loss'
        ? tList('outcome_loss')
        : tList('outcome_tie')
  const sizeLabel = tList(
    detail.sizeCategory === 'small'
      ? 'size_small'
      : detail.sizeCategory === 'middle'
        ? 'size_middle'
        : detail.sizeCategory === 'large'
          ? 'size_large'
          : 'size_zerg',
  )

  const outcomeColor =
    detail.outcome === 'win'
      ? 'text-emerald-400'
      : detail.outcome === 'loss'
        ? 'text-red-400'
        : 'text-gray-400'
  const OutcomeIcon =
    detail.outcome === 'win' ? Trophy : detail.outcome === 'loss' ? Skull : Minus

  const opponentLabel =
    detail.primaryOpponentName ??
    detail.opponentGuildNames[0] ??
    detail.opponentAllianceNames[0] ??
    '-'
  const extraGuildCount =
    detail.opponentGuildNames.length > 1 ? detail.opponentGuildNames.length - 1 : 0
  const allianceLabel =
    detail.opponentAllianceNames.length > 0 &&
    !(
      detail.opponentAllianceNames.length === 1 &&
      detail.opponentAllianceNames[0] === opponentLabel
    )
      ? detail.opponentAllianceNames.join(', ')
      : null

  const participants = groupByMember(detail.events)

  return (
    <>
      <header className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5 space-y-3">
        <div className="flex items-start gap-3">
          <Swords size={20} className="text-amber-400 mt-1 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-white text-lg sm:text-xl font-bold">{opponentLabel}</h1>
              <span className={`inline-flex items-center gap-1 text-xs font-semibold ${outcomeColor}`}>
                <OutcomeIcon size={14} />
                {outcomeLabel}
              </span>
            </div>
            {allianceLabel && (
              <p className="text-amber-300/80 text-xs">[{allianceLabel}]</p>
            )}
            {extraGuildCount > 0 && (
              <p className="text-gray-500 text-[11px]">
                {t('extraGuilds', { count: extraGuildCount })}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-gray-400 text-xs mt-2">
              <span className="inline-flex items-center gap-1">
                <Clock size={11} />
                {formatDateTime(detail.startedAt)}
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
                  {detail.homeTeamSize}v{detail.opponentTeamSize}
                </span>
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
            allianceName={allianceLabel}
            teamSize={detail.opponentTeamSize}
            kills={detail.opponentKills}
            deaths={detail.opponentDeaths}
            killFame={detail.opponentKillFame}
          />
        </div>
      </header>

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
                key={p.discord_id}
                participant={p}
                killLabel={(count) => t('participantKills', { count })}
                deathLabel={(count) => t('participantDeaths', { count })}
              />
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

interface Participant {
  discord_id: string
  username: string
  avatar: string | null
  kills: number
  deaths: number
}

function groupByMember(events: BattleKillEvent[]): Participant[] {
  const map = new Map<string, Participant>()
  for (const e of events) {
    let p = map.get(e.discord_id)
    if (!p) {
      p = {
        discord_id: e.discord_id,
        username: e.username,
        avatar: e.avatar,
        kills: 0,
        deaths: 0,
      }
      map.set(e.discord_id, p)
    }
    if (e.role === 'killer') p.kills++
    else if (e.role === 'victim') p.deaths++
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
  killLabel: (count: number) => string
  deathLabel: (count: number) => string
}

function ParticipantRow({
  participant,
  killLabel,
  deathLabel,
}: ParticipantRowProps) {
  return (
    <li className="bg-gray-900 border border-gray-800 rounded-lg p-3">
      <div className="flex items-center gap-3">
        <MemberAvatar
          discordId={participant.discord_id}
          avatar={participant.avatar}
          size={32}
        />
        <div className="min-w-0 flex-1">
          <Link
            href={`/members/${participant.discord_id}`}
            className="text-white text-sm font-semibold hover:text-amber-300 truncate block"
          >
            {participant.username}
          </Link>
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="text-emerald-400">{killLabel(participant.kills)}</span>
            <span className="text-red-400">{deathLabel(participant.deaths)}</span>
          </div>
        </div>
      </div>
    </li>
  )
}

function formatFame(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}
