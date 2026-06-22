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

export type MemberTradeBuyerAction = 'confirm' | 'cancel' | 'dispute'
export type MemberTradeSellerAction = 'deliver' | 'cancel'

export const MEMBER_TRADE_MEMO_MAX_LENGTH = 500
export const MEMBER_TRADE_DELIVERY_NOTE_MAX_LENGTH = 500
export const MEMBER_TRADE_DISPUTE_REASON_MAX_LENGTH = 500
export const MEMBER_TRADE_CITY_MAX_LENGTH = 80
export const MEMBER_TRADE_DEFAULT_EXPIRY_DAYS = 14
export const MEMBER_TRADE_ITEM_SEARCH_MIN_LENGTH = 2
export const MEMBER_TRADE_ITEM_SEARCH_MAX_LENGTH = 80
export const POSTGRES_INT_MAX = 2_147_483_647

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
