// 킬로그 기반 배틀 집계 결과 카드. 이벤트 상세 페이지에서 battles 행이 있을
// 때만 렌더 — pending 상태여도 "집계 중" 으로 안내해 사용자가 왜 결과가 없는지
// 알 수 있게 한다.
//
// 숫자 포맷: Albion 명성은 수천만 단위로 커질 수 있어 ko-KR 로컬 포맷(e.g.
// 12,345,678) 으로 찍는다. 길드 목록은 승자 → 패자 → ineligible 순으로 정렬.

import type { Battle, BattleParticipant, BattleParticipantOutcomeRole } from '@/types'
import { Swords, Trophy, Shield, Minus, EyeOff } from 'lucide-react'

interface Props {
  battle: Battle
  participants: BattleParticipant[]
}

const ROLE_ORDER: Record<NonNullable<BattleParticipantOutcomeRole>, number> = {
  winner: 0,
  draw: 1,
  loser: 2,
  ineligible: 3,
}

function sortParticipants(participants: BattleParticipant[]): BattleParticipant[] {
  return [...participants].sort((a, b) => {
    const aRank = a.outcome_role ? ROLE_ORDER[a.outcome_role] : 4
    const bRank = b.outcome_role ? ROLE_ORDER[b.outcome_role] : 4
    if (aRank !== bRank) return aRank - bRank
    return b.fame_delta - a.fame_delta
  })
}

function formatNumber(n: number): string {
  return n.toLocaleString('ko-KR')
}

function formatSignedNumber(n: number): string {
  return (n >= 0 ? '+' : '') + n.toLocaleString('ko-KR')
}

function OutcomeHeader({ battle }: { battle: Battle }) {
  if (battle.outcome === 'win') {
    return (
      <div className="flex items-center gap-2">
        <Trophy size={18} className="text-amber-300" />
        <span className="text-amber-300 font-extrabold text-lg tracking-wide">승리</span>
      </div>
    )
  }
  if (battle.outcome === 'loss') {
    return (
      <div className="flex items-center gap-2">
        <Shield size={18} className="text-rose-300" />
        <span className="text-rose-300 font-extrabold text-lg tracking-wide">패배</span>
      </div>
    )
  }
  if (battle.outcome === 'draw') {
    return (
      <div className="flex items-center gap-2">
        <Minus size={18} className="text-sky-300" />
        <span className="text-sky-300 font-extrabold text-lg tracking-wide">무승부</span>
      </div>
    )
  }
  if (battle.outcome === 'excluded') {
    return (
      <div className="flex items-center gap-2">
        <EyeOff size={18} className="text-gray-400" />
        <span className="text-gray-300 font-bold text-lg tracking-wide">집계 제외</span>
      </div>
    )
  }
  if (battle.outcome === 'error') {
    return (
      <div className="flex items-center gap-2">
        <Swords size={18} className="text-red-400" />
        <span className="text-red-300 font-bold text-lg tracking-wide">집계 오류</span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2">
      <Swords size={18} className="text-gray-300 animate-pulse" />
      <span className="text-gray-200 font-bold text-lg tracking-wide">집계 중…</span>
    </div>
  )
}

function excludeReasonLabel(reason: string | null): string {
  if (!reason) return ''
  switch (reason) {
    case 'too_small':
      return '전체 참여 인원 부족'
    case 'own_guild_absent':
      return '우리 길드 미참여'
    case 'own_guild_ineligible':
      return '우리 길드 참여 인원 부족'
    default:
      return reason
  }
}

function outcomeBorderClass(outcome: Battle['outcome']): string {
  if (outcome === 'win') return 'border-amber-500/40'
  if (outcome === 'loss') return 'border-rose-500/40'
  if (outcome === 'draw') return 'border-sky-500/40'
  if (outcome === 'error') return 'border-red-500/40'
  return 'border-gray-700'
}

function participantBadge(role: BattleParticipantOutcomeRole | null): React.ReactNode {
  if (role === 'winner') {
    return <span className="text-amber-300 text-[11px] font-bold">WIN</span>
  }
  if (role === 'loser') {
    return <span className="text-rose-300 text-[11px] font-bold">LOSS</span>
  }
  if (role === 'draw') {
    return <span className="text-sky-300 text-[11px] font-bold">DRAW</span>
  }
  if (role === 'ineligible') {
    return <span className="text-gray-500 text-[11px] font-bold">EXCL</span>
  }
  return null
}

export default function BattleResultCard({ battle, participants }: Props) {
  const sorted = sortParticipants(participants)
  const own = sorted.find((p) => p.is_own_guild)
  const isPending = battle.outcome === 'pending'
  const reasonLabel = excludeReasonLabel(battle.exclude_reason)

  return (
    <div
      className={`bg-gray-900 border rounded-2xl p-4 sm:p-5 space-y-4 ${outcomeBorderClass(battle.outcome)}`}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <p className="text-gray-500 text-xs uppercase tracking-widest">배틀 결과</p>
          <OutcomeHeader battle={battle} />
        </div>
        <div className="text-right text-xs text-gray-500 space-y-0.5">
          <div>총 {formatNumber(battle.total_players)}명 참여</div>
          {battle.aggregated_at ? (
            <div>집계 {new Date(battle.aggregated_at).toLocaleString('ko-KR')}</div>
          ) : (
            <div>윈도우 종료: {new Date(battle.window_end).toLocaleString('ko-KR')}</div>
          )}
        </div>
      </div>

      {isPending && (
        <p className="text-gray-400 text-xs">
          배틀 윈도우 종료 후 10분 내에 자동 집계됩니다.
        </p>
      )}

      {reasonLabel && (
        <div className="bg-gray-950/60 border border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-400">
          제외 사유: <span className="text-gray-200">{reasonLabel}</span>
        </div>
      )}

      {own && own.outcome_role && !isPending && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-gray-950/60 border border-gray-800 rounded-lg py-2">
            <div className="text-gray-500 text-[10px] uppercase">킬/데스</div>
            <div className="text-white text-sm font-mono">
              {own.kills} / {own.deaths}
            </div>
          </div>
          <div className="bg-gray-950/60 border border-gray-800 rounded-lg py-2">
            <div className="text-gray-500 text-[10px] uppercase">참여</div>
            <div className="text-white text-sm font-mono">{own.player_count}명</div>
          </div>
          <div className="bg-gray-950/60 border border-gray-800 rounded-lg py-2">
            <div className="text-gray-500 text-[10px] uppercase">명성차</div>
            <div
              className={`text-sm font-mono ${own.fame_delta >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}
            >
              {formatSignedNumber(own.fame_delta)}
            </div>
          </div>
        </div>
      )}

      {sorted.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-gray-500 text-[11px] uppercase tracking-widest">참여 길드</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-800">
                  <th className="text-left py-1.5 pr-2 font-normal">길드</th>
                  <th className="text-right py-1.5 px-2 font-normal">인원</th>
                  <th className="text-right py-1.5 px-2 font-normal">킬</th>
                  <th className="text-right py-1.5 px-2 font-normal">데스</th>
                  <th className="text-right py-1.5 pl-2 font-normal">명성차</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => (
                  <tr
                    key={p.guild_name}
                    className={`border-b border-gray-900 ${p.is_own_guild ? 'bg-amber-500/5' : ''}`}
                  >
                    <td className="py-1.5 pr-2">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium ${p.is_own_guild ? 'text-amber-200' : 'text-white'}`}>
                          {p.guild_name}
                        </span>
                        {participantBadge(p.outcome_role)}
                      </div>
                    </td>
                    <td className="text-right py-1.5 px-2 text-gray-300 font-mono">
                      {p.player_count}
                    </td>
                    <td className="text-right py-1.5 px-2 text-gray-300 font-mono">
                      {formatNumber(p.kills)}
                    </td>
                    <td className="text-right py-1.5 px-2 text-gray-300 font-mono">
                      {formatNumber(p.deaths)}
                    </td>
                    <td
                      className={`text-right py-1.5 pl-2 font-mono ${p.fame_delta >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}
                    >
                      {formatSignedNumber(p.fame_delta)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
