// 연합 컨텐츠 준수 도메인의 순수 규칙.
//
// 배틀로그 한 건은 곧 컨텐츠 한 회가 아니다. 같은 컨텐츠는 상대 force 분리,
// 이동, 재교전으로 여러 battle record가 될 수 있으므로 여기서 사후 세션으로
// 묶는다. DB/서버 액션은 이 함수가 반환한 후보를 확인·확정만 한다.

import { compareStrings } from '@/lib/sort-strings'

const MENHERA_TENANT_SLUG = 'menhera'
const DAY_MS = 24 * 60 * 60 * 1000
const VIDEO_DUE_DAYS = 7

export interface AllianceContentBattleInput {
  battleRecordId: string
  startedAt: string
  endedAt: string
  participantAlbionIds: readonly string[]
}

export interface AllianceContentSessionCandidate {
  battleRecordIds: string[]
  startedAt: string
  endedAt: string
  participantAlbionIds: string[]
}

export interface AllianceContentCandidateMemberLink {
  discordId: string
  username: string
  albionPlayerId: string
}

export interface AllianceContentCandidateRosterMember {
  albionPlayerId: string
  albionPlayerName: string
}

export interface AllianceContentCandidateParticipant {
  discordId: string | null
  username: string | null
  albionNickname: string
  isSiteLinked: boolean
}

export interface AllianceContentParticipationInput {
  sessionId: string
  endedAt: string
}

export interface AllianceContentVideoRequirementDraft {
  sessionIds: string[]
  dueAt: string
}

interface NormalizedBattle {
  battleRecordId: string
  startedAt: string
  endedAt: string
  startedAtMs: number
  endedAtMs: number
  participantAlbionIds: Set<string>
}

export function isMenheraAllianceContentComplianceEnabled(
  tenantSlug: string | null | undefined,
  enabledSetting: string | null | undefined,
): boolean {
  return tenantSlug === MENHERA_TENANT_SLUG && enabledSetting === 'true'
}

export function buildAllianceContentSessionCandidates(
  battles: readonly AllianceContentBattleInput[],
  gapMinutes: number,
): AllianceContentSessionCandidate[] {
  const normalized = normalizeBattles(battles)
  if (normalized.length === 0) return []

  const gapMs = Math.max(0, Math.trunc(gapMinutes)) * 60 * 1000
  const candidates: AllianceContentSessionCandidate[] = []
  let current = makeCandidate(normalized[0])

  for (let index = 1; index < normalized.length; index += 1) {
    const battle = normalized[index]
    const currentEndMs = Date.parse(current.endedAt)
    if (battle.startedAtMs <= currentEndMs + gapMs) {
      current = mergeBattleIntoCandidate(current, battle)
      continue
    }
    candidates.push(current)
    current = makeCandidate(battle)
  }

  candidates.push(current)
  return candidates
}

// 확정 RPC와 같은 우선순위: player snapshot이 하나라도 있으면 projection을,
// 아직 shadow projection이 없는 구형 로그라면 raw_battle.players를 사용한다.
export function selectAllianceContentBattleParticipantIds(
  snapshotParticipantAlbionIds: readonly string[],
  rawParticipantAlbionIds: readonly string[],
): string[] {
  const source = snapshotParticipantAlbionIds.length > 0
    ? snapshotParticipantAlbionIds
    : rawParticipantAlbionIds
  return Array.from(new Set(source.filter(Boolean))).sort(compareStrings)
}

// 후보 화면은 타 길드 플레이어 전체를 노출하지 않는다. 현재 길드 로스터와
// 교집합만 반환하고, 사이트 연결 여부로 확정 시 자동 참여 반영 대상을 구분한다.
export function resolveAllianceContentCandidateParticipants(
  participantAlbionIds: readonly string[],
  activeRosterMembers: readonly AllianceContentCandidateRosterMember[],
  linkedMembers: readonly AllianceContentCandidateMemberLink[],
): AllianceContentCandidateParticipant[] {
  const detected = new Set(participantAlbionIds)
  const linkedByAlbionPlayerId = new Map(
    linkedMembers.map((member) => [member.albionPlayerId, member]),
  )
  const byAlbionPlayerId = new Map<string, AllianceContentCandidateParticipant>()

  for (const member of activeRosterMembers) {
    if (!detected.has(member.albionPlayerId)) continue
    if (!member.albionPlayerId || !member.albionPlayerName) continue
    const link = linkedByAlbionPlayerId.get(member.albionPlayerId)
    byAlbionPlayerId.set(member.albionPlayerId, {
      discordId: link?.discordId ?? null,
      username: link?.username ?? null,
      albionNickname: member.albionPlayerName,
      isSiteLinked: Boolean(link?.discordId && link.username),
    })
  }

  return Array.from(byAlbionPlayerId.values()).sort((left, right) => {
    return compareStrings(left.albionNickname, right.albionNickname)
      || compareStrings(left.username ?? '', right.username ?? '')
      || compareStrings(left.discordId ?? '', right.discordId ?? '')
  })
}

export function buildVideoRequirementDrafts(
  participations: readonly AllianceContentParticipationInput[],
  assignedSessionIds: ReadonlySet<string>,
): AllianceContentVideoRequirementDraft[] {
  const unassigned = participations
    .filter((participation) => !assignedSessionIds.has(participation.sessionId))
    .filter((participation) => Number.isFinite(Date.parse(participation.endedAt)))
    .sort(
      (left, right) =>
        left.endedAt.localeCompare(right.endedAt) || left.sessionId.localeCompare(right.sessionId),
    )

  const requirements: AllianceContentVideoRequirementDraft[] = []
  for (let index = 0; index + 2 < unassigned.length; index += 3) {
    const batch = unassigned.slice(index, index + 3)
    const completedAtMs = Date.parse(batch[2].endedAt)
    requirements.push({
      sessionIds: batch.map((participation) => participation.sessionId),
      dueAt: new Date(completedAtMs + VIDEO_DUE_DAYS * DAY_MS).toISOString(),
    })
  }
  return requirements
}

function normalizeBattles(
  battles: readonly AllianceContentBattleInput[],
): NormalizedBattle[] {
  const byRecordId = new Map<string, NormalizedBattle>()
  for (const battle of battles) {
    const startedAtMs = Date.parse(battle.startedAt)
    const endedAtMs = Date.parse(battle.endedAt)
    if (!battle.battleRecordId || !Number.isFinite(startedAtMs) || !Number.isFinite(endedAtMs)) {
      continue
    }
    const existing = byRecordId.get(battle.battleRecordId)
    if (!existing) {
      byRecordId.set(battle.battleRecordId, {
        battleRecordId: battle.battleRecordId,
        startedAt: battle.startedAt,
        endedAt: battle.endedAt,
        startedAtMs,
        endedAtMs,
        participantAlbionIds: new Set(battle.participantAlbionIds.filter(Boolean)),
      })
      continue
    }

    const mergedParticipants = new Set([...existing.participantAlbionIds, ...battle.participantAlbionIds])
    byRecordId.set(battle.battleRecordId, {
      battleRecordId: existing.battleRecordId,
      startedAt: startedAtMs < existing.startedAtMs ? battle.startedAt : existing.startedAt,
      endedAt: endedAtMs > existing.endedAtMs ? battle.endedAt : existing.endedAt,
      startedAtMs: Math.min(existing.startedAtMs, startedAtMs),
      endedAtMs: Math.max(existing.endedAtMs, endedAtMs),
      participantAlbionIds: mergedParticipants,
    })
  }
  return Array.from(byRecordId.values()).sort(
    (left, right) =>
      left.startedAtMs - right.startedAtMs ||
      left.endedAtMs - right.endedAtMs ||
      left.battleRecordId.localeCompare(right.battleRecordId),
  )
}

function makeCandidate(battle: NormalizedBattle): AllianceContentSessionCandidate {
  return {
    battleRecordIds: [battle.battleRecordId],
    startedAt: battle.startedAt,
    endedAt: battle.endedAt,
    participantAlbionIds: Array.from(battle.participantAlbionIds).sort(),
  }
}

function mergeBattleIntoCandidate(
  candidate: AllianceContentSessionCandidate,
  battle: NormalizedBattle,
): AllianceContentSessionCandidate {
  const participantAlbionIds = new Set([...candidate.participantAlbionIds, ...battle.participantAlbionIds])
  const candidateEndMs = Date.parse(candidate.endedAt)
  return {
    battleRecordIds: [...candidate.battleRecordIds, battle.battleRecordId],
    startedAt: candidate.startedAt,
    endedAt: battle.endedAtMs > candidateEndMs ? battle.endedAt : candidate.endedAt,
    participantAlbionIds: Array.from(participantAlbionIds).sort(),
  }
}
