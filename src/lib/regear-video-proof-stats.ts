export interface RegearVideoProofRequestInput {
  discordId: string
  username: string
  status: string | null
  createdAt: string
  videoProofUrl: string | null
}

export interface RegearVideoProofAvatarInput {
  discordId: string
  username: string
  avatar: string | null
  isAdmin: boolean
  withdrawnAt: string | null
}

export interface RegearVideoProofMemberStats {
  discordId: string
  username: string
  avatar: string | null
  isAdmin: boolean
  requestCount: number
  videoProofCount: number
  attachmentRate: number
  lastRequestAt: string
  lastVideoProofAt: string | null
}

export const REGEAR_VIDEO_PROOF_WINDOW_OPTIONS = ['7', '30', '90', 'all'] as const
export type RegearVideoProofWindow = (typeof REGEAR_VIDEO_PROOF_WINDOW_OPTIONS)[number]
export const DEFAULT_REGEAR_VIDEO_PROOF_WINDOW: RegearVideoProofWindow = '30'

export interface RegearVideoProofStats {
  window: RegearVideoProofWindow
  windowDays: number | null
  totalRequests: number
  withVideoProof: number
  videoProofMemberCount: number
  averageVideoProofsPerMember: number
  attachmentRate: number
  latestVideoProofAt: string | null
  members: RegearVideoProofMemberStats[]
}

interface BuildRegearVideoProofStatsInput {
  window: RegearVideoProofWindow
  windowDays: number | null
  avatars: RegearVideoProofAvatarInput[]
  requests: RegearVideoProofRequestInput[]
}

export function normalizeRegearVideoProofWindow(
  raw: string | string[] | undefined,
): RegearVideoProofWindow {
  const value = Array.isArray(raw) ? raw[0] : raw
  return REGEAR_VIDEO_PROOF_WINDOW_OPTIONS.includes(value as RegearVideoProofWindow)
    ? (value as RegearVideoProofWindow)
    : DEFAULT_REGEAR_VIDEO_PROOF_WINDOW
}

export function regearVideoProofWindowDays(window: RegearVideoProofWindow): number | null {
  return window === 'all' ? null : Number(window)
}

function hasVideoProof(url: string | null): boolean {
  return Boolean(url?.trim())
}

function latestIso(left: string | null, right: string): string {
  if (!left) return right
  return left > right ? left : right
}

export function buildRegearVideoProofStats({
  window,
  windowDays,
  avatars,
  requests,
}: BuildRegearVideoProofStatsInput): RegearVideoProofStats {
  const activeAvatars = new Map(
    avatars
      .filter((avatar) => avatar.withdrawnAt === null)
      .map((avatar) => [avatar.discordId, avatar]),
  )
  const activeRequests = requests.filter((request) => activeAvatars.has(request.discordId))

  const memberMap = activeRequests.reduce((current, request) => {
    const avatar = activeAvatars.get(request.discordId)
    if (!avatar) return current

    const hasProof = hasVideoProof(request.videoProofUrl)
    const previous = current.get(request.discordId)
    const nextRequestCount = (previous?.requestCount ?? 0) + 1
    const nextVideoProofCount = (previous?.videoProofCount ?? 0) + (hasProof ? 1 : 0)

    current.set(request.discordId, {
      discordId: request.discordId,
      username: avatar.username || request.username,
      avatar: avatar.avatar,
      isAdmin: avatar.isAdmin,
      requestCount: nextRequestCount,
      videoProofCount: nextVideoProofCount,
      attachmentRate: nextRequestCount > 0 ? nextVideoProofCount / nextRequestCount : 0,
      lastRequestAt: latestIso(previous?.lastRequestAt ?? null, request.createdAt),
      lastVideoProofAt: hasProof
        ? latestIso(previous?.lastVideoProofAt ?? null, request.createdAt)
        : previous?.lastVideoProofAt ?? null,
    })
    return current
  }, new Map<string, RegearVideoProofMemberStats>())

  const withVideoProof = activeRequests.filter((request) => hasVideoProof(request.videoProofUrl)).length
  const totalRequests = activeRequests.length
  const latestVideoProofAt = activeRequests.reduce<string | null>(
    (latest, request) => (hasVideoProof(request.videoProofUrl) ? latestIso(latest, request.createdAt) : latest),
    null,
  )
  const members = Array.from(memberMap.values())
    .filter((member): member is RegearVideoProofMemberStats & { lastVideoProofAt: string } =>
      member.videoProofCount > 0 && member.lastVideoProofAt !== null,
    )
    .sort(
      (left, right) =>
        right.videoProofCount - left.videoProofCount ||
        right.attachmentRate - left.attachmentRate ||
        right.lastVideoProofAt.localeCompare(left.lastVideoProofAt) ||
        left.username.localeCompare(right.username) ||
        left.discordId.localeCompare(right.discordId),
    )

  return {
    window,
    windowDays,
    totalRequests,
    withVideoProof,
    videoProofMemberCount: members.length,
    averageVideoProofsPerMember: members.length > 0 ? withVideoProof / members.length : 0,
    attachmentRate: totalRequests > 0 ? withVideoProof / totalRequests : 0,
    latestVideoProofAt,
    members,
  }
}
