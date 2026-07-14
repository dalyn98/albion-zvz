const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface AllianceContentRegearSessionOption {
  id: string
  endedAt: string
  albionBattleIds: number[]
}

export interface AllianceContentRegearVideoOption {
  requirementId: string
  dueAt: string
  sessions: AllianceContentRegearSessionOption[]
}

export interface AllianceContentRegearLinkedSubmission {
  id: string
  status: 'pending' | 'approved'
}

export interface AllianceContentRegearVideoContext {
  option: AllianceContentRegearVideoOption | null
  linkedSubmission: AllianceContentRegearLinkedSubmission | null
  sourceAlbionBattleIds: number[]
}

export interface AllianceContentRegearLinkInput {
  requirementId: string
  sessionId: string
}

export type AllianceContentRegearSubmitStatus = 'submitted' | 'failed'

interface SessionWithBattleIds {
  id: string
  albionBattleIds: readonly number[]
}

export function inferAllianceContentRegearSessionId(
  sessions: readonly SessionWithBattleIds[],
  sourceAlbionBattleIds: readonly number[],
): string | null {
  const sourceIds = new Set(sourceAlbionBattleIds.filter(Number.isSafeInteger))
  if (sourceIds.size === 0) return null

  const matchedSessionIds = sessions
    .filter((session) => session.albionBattleIds.some((battleId) => sourceIds.has(battleId)))
    .map((session) => session.id)

  return matchedSessionIds.length === 1 ? matchedSessionIds[0] : null
}

export function parseAllianceContentRegearLinkInput(
  formData: FormData,
): AllianceContentRegearLinkInput | null {
  if (formData.get('allianceContentUseVideo') !== 'true') return null
  const requirementId = String(formData.get('allianceContentRequirementId') ?? '')
  const sessionId = String(formData.get('allianceContentSessionId') ?? '')
  return isAllianceContentRegearLinkInput({ requirementId, sessionId })
    ? { requirementId, sessionId }
    : null
}

export function isAllianceContentRegearLinkInput(
  input: AllianceContentRegearLinkInput | null | undefined,
): input is AllianceContentRegearLinkInput {
  return Boolean(
    input && UUID_PATTERN.test(input.requirementId) && UUID_PATTERN.test(input.sessionId),
  )
}

export function appendAllianceContentRegearLinkInput(
  formData: FormData,
  option: AllianceContentRegearVideoOption | null,
  sessionId: string,
  shouldUseVideo: boolean,
): void {
  if (!shouldUseVideo || !option || !UUID_PATTERN.test(sessionId)) return
  formData.set('allianceContentUseVideo', 'true')
  formData.set('allianceContentRequirementId', option.requirementId)
  formData.set('allianceContentSessionId', sessionId)
}
