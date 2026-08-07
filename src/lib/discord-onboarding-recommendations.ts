export interface OnboardingDiscordRoleCandidate {
  id: string
  name: string
  position: number
  hasAdminPerm: boolean
}

export interface OnboardingDiscordChannelCandidate {
  id: string
  name: string
  position: number
  parentName: string | null
  type: number
}

export interface DiscordOnboardingRecommendations {
  memberRoleId: string | null
  eventChannelId: string | null
}

const ADMINISTRATOR_BIT = BigInt(1) << BigInt(3)
const MANAGE_GUILD_BIT = BigInt(1) << BigInt(5)
const ZERO_BIG = BigInt(0)

export function hasDiscordAdminPermission(permissions?: string): boolean {
  if (!permissions) return false
  try {
    const bits = BigInt(permissions)
    return (
      (bits & ADMINISTRATOR_BIT) !== ZERO_BIG ||
      (bits & MANAGE_GUILD_BIT) !== ZERO_BIG
    )
  } catch {
    return false
  }
}

const MEMBER_ROLE_EXACT = new Set([
  'member',
  'members',
  'guild member',
  'guild members',
  'verified',
  '길드원',
  '멤버',
  '정회원',
  'メンバー',
  'ギルドメンバー',
  '成员',
  '成員',
  '公会成员',
  '公會成員',
])

const MEMBER_ROLE_HINTS = [
  'member',
  'verified',
  '길드원',
  '멤버',
  '정회원',
  'メンバー',
  '成员',
  '成員',
]

const PRIVILEGED_OR_NON_MEMBER_HINTS = [
  'admin',
  'administrator',
  'officer',
  'leader',
  'master',
  'bot',
  'guest',
  '관리자',
  '운영진',
  '게스트',
  '管理',
  '官員',
  '机器人',
  '機器人',
]

const EVENT_CHANNEL_EXACT = new Set([
  'event',
  'events',
  'guild event',
  'guild events',
  'zvz event',
  'zvz events',
  'cta',
  'mass',
  'announcements',
  'announcement',
  '이벤트',
  '공지',
  '공지사항',
  '출정',
  'イベント',
  'お知らせ',
  '活动',
  '活動',
  '公告',
  '通知',
])

const EVENT_CHANNEL_HINTS = [
  'event',
  'zvz',
  'cta',
  'mass',
  'announcement',
  '이벤트',
  '공지',
  '출정',
  'イベント',
  'お知らせ',
  '活动',
  '活動',
  '公告',
  '通知',
]

const UNSAFE_CHANNEL_HINTS = [
  'archive',
  'log',
  'test',
  'officer',
  'leadership',
  '보관',
  '로그',
  '테스트',
  '운영진',
  'ログ',
  'テスト',
  '归档',
  '歸檔',
  '日志',
]

function normalizeDiscordResourceName(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[_\s-]+/g, ' ')
    .trim()
}

function containsAny(value: string, candidates: readonly string[]): boolean {
  return candidates.some((candidate) => value.includes(candidate))
}

function memberRoleScore(role: OnboardingDiscordRoleCandidate): number {
  if (role.hasAdminPerm) return 0
  const name = normalizeDiscordResourceName(role.name)
  if (!name || containsAny(name, PRIVILEGED_OR_NON_MEMBER_HINTS)) return 0
  if (MEMBER_ROLE_EXACT.has(name)) return 100
  if (containsAny(name, MEMBER_ROLE_HINTS)) return 70
  return 0
}

function eventChannelScore(channel: OnboardingDiscordChannelCandidate): number {
  const name = normalizeDiscordResourceName(channel.name)
  const parentName = normalizeDiscordResourceName(channel.parentName ?? '')
  if (!name || containsAny(`${parentName} ${name}`, UNSAFE_CHANNEL_HINTS)) return 0

  let score = EVENT_CHANNEL_EXACT.has(name) ? 100 : 0
  if (score === 0 && containsAny(name, EVENT_CHANNEL_HINTS)) score = 75
  if (score === 0 && containsAny(parentName, EVENT_CHANNEL_HINTS)) score = 45
  if (score > 0 && channel.type === 5) score += 5
  return score
}

function highestConfidenceCandidate<T extends { position: number }>(
  candidates: readonly T[],
  score: (candidate: T) => number,
): T | null {
  let best: T | null = null
  let bestScore = 0
  for (const candidate of candidates) {
    const candidateScore = score(candidate)
    if (
      candidateScore > bestScore ||
      (candidateScore === bestScore && candidateScore > 0 && candidate.position > (best?.position ?? -1))
    ) {
      best = candidate
      bestScore = candidateScore
    }
  }
  return bestScore > 0 ? best : null
}

export function recommendDiscordOnboardingResources(
  roles: readonly OnboardingDiscordRoleCandidate[],
  channels: readonly OnboardingDiscordChannelCandidate[],
): DiscordOnboardingRecommendations {
  return {
    memberRoleId: highestConfidenceCandidate(roles, memberRoleScore)?.id ?? null,
    eventChannelId: highestConfidenceCandidate(channels, eventChannelScore)?.id ?? null,
  }
}
