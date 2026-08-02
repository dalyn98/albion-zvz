export const MEMBER_WORK_DOMAINS = [
  'regear',
  'exchange',
  'donation',
  'shop',
  'member_trade',
  'craft',
  'treasury_deposit',
] as const

export type MemberWorkDomain = (typeof MEMBER_WORK_DOMAINS)[number]
export type MemberWorkBucket = 'action_required' | 'waiting_on_guild' | 'history'
export type MemberWorkNextActor = 'member' | 'guild' | 'counterparty' | 'operator' | 'none'
export type MemberWorkUnit = 'silver' | 'points' | 'items'

export interface MemberWorkInboxItem {
  itemKey: string
  domain: MemberWorkDomain
  sourceId: string
  bucket: MemberWorkBucket
  stage: string
  status: string
  title: string
  amount: number | null
  unit: MemberWorkUnit
  createdAt: string
  updatedAt: string
  dueAt: string | null
  href: string
  nextActor: MemberWorkNextActor
  metadata: Record<string, unknown>
}

export interface MemberWorkInboxSnapshot {
  available: boolean
  actionRequired: MemberWorkInboxItem[]
  waitingOnGuild: MemberWorkInboxItem[]
  history: MemberWorkInboxItem[]
  actionRequiredCount: number
  waitingOnGuildCount: number
  activeCount: number
  activeCountsByDomain: Record<MemberWorkDomain, number>
  topAction: MemberWorkInboxItem | null
}

const DOMAIN_SET = new Set<string>(MEMBER_WORK_DOMAINS)
const BUCKET_SET = new Set<string>(['action_required', 'waiting_on_guild', 'history'])
const NEXT_ACTOR_SET = new Set<string>(['member', 'guild', 'counterparty', 'operator', 'none'])
const UNIT_SET = new Set<string>(['silver', 'points', 'items'])

export function buildMemberWorkInboxSnapshot(
  rows: readonly unknown[],
  available = true,
): MemberWorkInboxSnapshot {
  const unique = new Map<string, MemberWorkInboxItem>()
  for (const raw of rows) {
    const item = normalizeMemberWorkInboxItem(raw)
    if (!item || unique.has(item.itemKey)) continue
    unique.set(item.itemKey, item)
  }

  const actionRequired = [...unique.values()]
    .filter((item) => item.bucket === 'action_required')
    .sort(compareActiveWork)
  const waitingOnGuild = [...unique.values()]
    .filter((item) => item.bucket === 'waiting_on_guild')
    .sort(compareActiveWork)
  const history = [...unique.values()]
    .filter((item) => item.bucket === 'history')
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  const activeCountsByDomain = emptyDomainCounts()
  for (const item of [...actionRequired, ...waitingOnGuild]) {
    activeCountsByDomain[item.domain] += 1
  }

  return {
    available,
    actionRequired,
    waitingOnGuild,
    history,
    actionRequiredCount: actionRequired.length,
    waitingOnGuildCount: waitingOnGuild.length,
    activeCount: actionRequired.length + waitingOnGuild.length,
    activeCountsByDomain,
    topAction: actionRequired[0] ?? waitingOnGuild[0] ?? null,
  }
}

export function createEmptyMemberWorkInboxSnapshot(
  available = true,
): MemberWorkInboxSnapshot {
  return buildMemberWorkInboxSnapshot([], available)
}

function normalizeMemberWorkInboxItem(raw: unknown): MemberWorkInboxItem | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  if (
    typeof row.item_key !== 'string' || !row.item_key.trim() ||
    typeof row.domain !== 'string' || !DOMAIN_SET.has(row.domain) ||
    typeof row.source_id !== 'string' || !row.source_id.trim() ||
    typeof row.bucket !== 'string' || !BUCKET_SET.has(row.bucket) ||
    typeof row.stage !== 'string' || !row.stage.trim() ||
    typeof row.status !== 'string' || !row.status.trim() ||
    typeof row.title !== 'string' ||
    typeof row.created_at !== 'string' || !isValidDate(row.created_at) ||
    typeof row.updated_at !== 'string' || !isValidDate(row.updated_at) ||
    typeof row.href !== 'string' || !isSafeInternalHref(row.href) ||
    typeof row.next_actor !== 'string' || !NEXT_ACTOR_SET.has(row.next_actor) ||
    typeof row.unit !== 'string' || !UNIT_SET.has(row.unit)
  ) return null

  const dueAt = row.due_at == null
    ? null
    : typeof row.due_at === 'string' && isValidDate(row.due_at)
      ? row.due_at
      : null
  const amount = normalizeAmount(row.amount)
  const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
    ? row.metadata as Record<string, unknown>
    : {}

  return {
    itemKey: row.item_key,
    domain: row.domain as MemberWorkDomain,
    sourceId: row.source_id,
    bucket: row.bucket as MemberWorkBucket,
    stage: row.stage,
    status: row.status,
    title: row.title.trim(),
    amount,
    unit: row.unit as MemberWorkUnit,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    dueAt,
    href: row.href,
    nextActor: row.next_actor as MemberWorkNextActor,
    metadata,
  }
}

function compareActiveWork(left: MemberWorkInboxItem, right: MemberWorkInboxItem): number {
  if (left.dueAt && right.dueAt && left.dueAt !== right.dueAt) {
    return left.dueAt.localeCompare(right.dueAt)
  }
  if (left.dueAt && !right.dueAt) return -1
  if (!left.dueAt && right.dueAt) return 1
  if (left.createdAt !== right.createdAt) return left.createdAt.localeCompare(right.createdAt)
  return left.itemKey.localeCompare(right.itemKey)
}

function normalizeAmount(value: unknown): number | null {
  if (value == null) return null
  const amount = Number(value)
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null
}

function isValidDate(value: string): boolean {
  return Number.isFinite(Date.parse(value))
}

function isSafeInternalHref(value: string): boolean {
  return value.startsWith('/') && !value.startsWith('//') && !/[\r\n]/.test(value)
}

function emptyDomainCounts(): Record<MemberWorkDomain, number> {
  return Object.fromEntries(
    MEMBER_WORK_DOMAINS.map((domain) => [domain, 0]),
  ) as Record<MemberWorkDomain, number>
}
