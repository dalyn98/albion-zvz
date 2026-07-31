export interface ShopOrderPriceReview {
  id: string
  requestedTotalPoints: number
  proposedTotalPoints: number
  status: 'awaiting_member' | 'member_confirmed'
  proposalNote: string | null
  createdAt: string
  memberConfirmedAt: string | null
}
