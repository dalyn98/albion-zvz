export type MemberTradeListingStatus =
  | 'active'
  | 'paused'
  | 'sold_out'
  | 'closed'
  | 'expired'

export type MemberTradeOrderStatus =
  | 'awaiting_delivery'
  | 'delivered'
  | 'completed'
  | 'cancelled'
  | 'disputed'
  | 'refunded'

export type MemberTradePriceOfferStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'cancelled'
  | 'expired'

export type MemberTradeBuyerAction = 'confirm' | 'cancel' | 'dispute'
export type MemberTradeSellerAction = 'deliver' | 'cancel'
export type MemberTradeListingLifecycleAction = 'pause' | 'resume' | 'close'

export const MEMBER_TRADE_MEMO_MAX_LENGTH = 500
export const MEMBER_TRADE_DELIVERY_NOTE_MAX_LENGTH = 500
export const MEMBER_TRADE_DISPUTE_REASON_MAX_LENGTH = 500
export const MEMBER_TRADE_CITY_MAX_LENGTH = 80
export const MEMBER_TRADE_POST_TITLE_MIN_LENGTH = 2
export const MEMBER_TRADE_POST_TITLE_MAX_LENGTH = 80
export const MEMBER_TRADE_POST_DESCRIPTION_MAX_LENGTH = 1000
export const MEMBER_TRADE_MAX_ITEMS_PER_POST = 30
export const MEMBER_TRADE_DEFAULT_EXPIRY_DAYS = 14
export const MEMBER_TRADE_ITEM_SEARCH_MIN_LENGTH = 2
export const MEMBER_TRADE_ITEM_SEARCH_MAX_LENGTH = 80
export const POSTGRES_INT_MAX = 2_147_483_647

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const MEMBER_TRADE_LISTING_LIFECYCLE_ACTIONS: readonly MemberTradeListingLifecycleAction[] = [
  'pause',
  'resume',
  'close',
]

export interface SpendablePointInput {
  balance: number
  escrowed: number
}

export interface PurchasableListingInput {
  status: MemberTradeListingStatus
  quantityAvailable: number
  expiresAt: string | null
  now?: Date
}

export interface MemberTradePurchaseItemInput {
  itemId: unknown
  quantity: unknown
}

export interface NormalizedMemberTradePurchaseItem {
  itemId: string
  quantity: number
}

export interface MemberTradePriceOfferItemInput extends MemberTradePurchaseItemInput {
  unitPoints: unknown
}

export interface NormalizedMemberTradePriceOfferItem extends NormalizedMemberTradePurchaseItem {
  unitPoints: number
}

export function computeSpendablePointBalance(input: SpendablePointInput): number {
  const balance = Number.isFinite(input.balance) ? Math.trunc(input.balance) : 0
  const escrowed = Number.isFinite(input.escrowed) ? Math.trunc(input.escrowed) : 0
  return Math.max(0, balance - Math.max(0, escrowed))
}

export function normalizeMemberTradeQuantity(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > POSTGRES_INT_MAX) {
    return null
  }
  return parsed
}

export function isMemberTradeListingLifecycleAction(
  value: unknown,
): value is MemberTradeListingLifecycleAction {
  return (
    typeof value === 'string' &&
    MEMBER_TRADE_LISTING_LIFECYCLE_ACTIONS.includes(value as MemberTradeListingLifecycleAction)
  )
}

export function isMemberTradeUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

export function normalizeMemberTradeItemSearchQuery(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.normalize('NFKC').trim().replace(/\s+/g, ' ')
  if (
    normalized.length < MEMBER_TRADE_ITEM_SEARCH_MIN_LENGTH ||
    normalized.length > MEMBER_TRADE_ITEM_SEARCH_MAX_LENGTH
  ) {
    return null
  }
  return normalized
}

export function getNextMemberTradeItemSearchIndex(
  currentIndex: number,
  resultCount: number,
  direction: -1 | 1,
): number {
  if (!Number.isInteger(resultCount) || resultCount <= 0) return -1
  const safeCurrent =
    Number.isInteger(currentIndex) && currentIndex >= 0 && currentIndex < resultCount
      ? currentIndex
      : direction > 0
        ? -1
        : 0
  return (safeCurrent + direction + resultCount) % resultCount
}

export function sanitizeMemberTradeTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.normalize('NFKC').trim().replace(/\s+/g, ' ')
  if (
    normalized.length < MEMBER_TRADE_POST_TITLE_MIN_LENGTH ||
    normalized.length > MEMBER_TRADE_POST_TITLE_MAX_LENGTH
  ) {
    return null
  }
  return normalized
}

export function normalizeMemberTradePurchaseItems(
  value: unknown,
): NormalizedMemberTradePurchaseItem[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MEMBER_TRADE_MAX_ITEMS_PER_POST) {
    return null
  }

  const normalized: NormalizedMemberTradePurchaseItem[] = []
  const seen = new Set<string>()
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return null
    const item = raw as Partial<MemberTradePurchaseItemInput>
    if (typeof item.itemId !== 'string' || !UUID_RE.test(item.itemId)) return null
    if (seen.has(item.itemId)) return null
    const quantity = normalizeMemberTradeQuantity(item.quantity)
    if (quantity === null) return null
    seen.add(item.itemId)
    normalized.push({ itemId: item.itemId, quantity })
  }

  return normalized
}

export function normalizeMemberTradePriceOfferItems(
  value: unknown,
): NormalizedMemberTradePriceOfferItem[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MEMBER_TRADE_MAX_ITEMS_PER_POST) {
    return null
  }

  const normalized: NormalizedMemberTradePriceOfferItem[] = []
  const seen = new Set<string>()
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return null
    const item = raw as Partial<MemberTradePriceOfferItemInput>
    if (typeof item.itemId !== 'string' || !UUID_RE.test(item.itemId)) return null
    if (seen.has(item.itemId)) return null
    const quantity = normalizeMemberTradeQuantity(item.quantity)
    const unitPoints = normalizeMemberTradeUnitPoints(item.unitPoints)
    if (quantity === null || unitPoints === null) return null
    if (unitPoints > Math.floor(POSTGRES_INT_MAX / quantity)) return null
    seen.add(item.itemId)
    normalized.push({ itemId: item.itemId, quantity, unitPoints })
  }

  return normalized
}

export function normalizeMemberTradeUnitPoints(value: unknown): number | null {
  return normalizeMemberTradeQuantity(value)
}

export function isMemberTradeListingPurchasable(input: PurchasableListingInput): boolean {
  if (input.status !== 'active') return false
  if (!Number.isInteger(input.quantityAvailable) || input.quantityAvailable <= 0) return false
  if (!input.expiresAt) return true
  const expiresAt = new Date(input.expiresAt)
  if (!Number.isFinite(expiresAt.getTime())) return false
  return expiresAt.getTime() > (input.now ?? new Date()).getTime()
}

export function isMemberTradeBuyerActionAllowed(
  status: MemberTradeOrderStatus,
  action: MemberTradeBuyerAction,
): boolean {
  if (action === 'confirm') return status === 'delivered'
  if (action === 'cancel') return status === 'awaiting_delivery'
  if (action === 'dispute') return status === 'delivered'
  return false
}

export function isMemberTradeSellerActionAllowed(
  status: MemberTradeOrderStatus,
  action: MemberTradeSellerAction,
): boolean {
  if (action === 'deliver') return status === 'awaiting_delivery'
  if (action === 'cancel') return status === 'awaiting_delivery'
  return false
}

export function defaultMemberTradeExpiresAt(now = new Date()): string {
  const expiresAt = new Date(now)
  expiresAt.setDate(expiresAt.getDate() + MEMBER_TRADE_DEFAULT_EXPIRY_DAYS)
  return expiresAt.toISOString()
}

export function sanitizeMemberTradeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.normalize('NFKC').trim().replace(/\s+/g, ' ')
  if (!normalized) return null
  return normalized.slice(0, maxLength)
}
