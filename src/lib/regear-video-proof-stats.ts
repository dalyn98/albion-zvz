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
  pendingWithoutVideoProof: number
  attachmentRate: number
  lastRequestAt: string
  lastVideoProofAt: string | null
}

export interface RegearVideoProofStats {
  windowDays: number
  totalRequests: number
  withVideoProof: number
  withoutVideoProof: number
  pendingWithoutVideoProof: number
  activeRequesters: number
  attachmentRate: number
  members: RegearVideoProofMemberStats[]
}

interface BuildRegearVideoProofStatsInput {
  windowDays: number
  avatars: RegearVideoProofAvatarInput[]
  requests: RegearVideoProofRequestInput[]
}

function hasVideoProof(url: string | null): boolean {
  return Boolean(url?.trim())
}

function latestIso(left: string | null, right: string): string {
  if (!left) return right
  return left > right ? left : right
}

export function buildRegearVideoProofStats({
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
    const isPendingWithoutProof = request.status === 'pending' && !hasProof
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
      pendingWithoutVideoProof:
        (previous?.pendingWithoutVideoProof ?? 0) + (isPendingWithoutProof ? 1 : 0),
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
  const pendingWithoutVideoProof = activeRequests.filter(
    (request) => request.status === 'pending' && !hasVideoProof(request.videoProofUrl),
  ).length
  const members = Array.from(memberMap.values()).sort(
    (left, right) =>
      right.requestCount - left.requestCount ||
      right.videoProofCount - left.videoProofCount ||
      left.username.localeCompare(right.username) ||
      left.discordId.localeCompare(right.discordId),
  )

  return {
    windowDays,
    totalRequests,
    withVideoProof,
    withoutVideoProof: totalRequests - withVideoProof,
    pendingWithoutVideoProof,
    activeRequesters: members.length,
    attachmentRate: totalRequests > 0 ? withVideoProof / totalRequests : 0,
    members,
  }
}
