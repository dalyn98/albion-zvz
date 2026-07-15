// 데모 승인 시드 — 환전 / 기부 / 상점 / 이벤트 보상 / 청부 제작.
// 어드민 사이드바 배지 카운트 (DEMO_ADMIN_BADGES) 도 여기에 합쳐 둔다.

import type { DemoTimeLabel } from './shared'
import { DEMO_REGEAR_LIST } from './regear'

export type DemoApprovalCommonStatus = 'pending' | 'approved' | 'rejected'

// 환전 (Exchange) 청구 시드. 길드원이 보유 포인트를 실버로 환전 요청한 건들.
export type DemoExchangeRequest = {
  id: string
  member: string
  points: number
  silver: number
  ratePercent: number
  requestedAt: DemoTimeLabel
  status: DemoApprovalCommonStatus
  handledBy?: string
}

export const DEMO_EXCHANGE_REQUESTS: DemoExchangeRequest[] = [
  {
    id: 'ex-1',
    member: 'ShadowAce',
    points: 800,
    silver: 800_000,
    ratePercent: 100,
    requestedAt: { day: 'today', time: '12:32' },
    status: 'pending',
  },
  {
    id: 'ex-2',
    member: 'NebulaQ',
    points: 500,
    silver: 500_000,
    ratePercent: 100,
    requestedAt: { day: 'today', time: '11:08' },
    status: 'pending',
  },
  {
    id: 'ex-3',
    member: 'Frostpine',
    points: 1_200,
    silver: 1_200_000,
    ratePercent: 100,
    requestedAt: { day: 'yesterday', time: '20:14' },
    status: 'approved',
    handledBy: 'Eternia',
  },
  {
    id: 'ex-4',
    member: 'Mochi',
    points: 300,
    silver: 300_000,
    ratePercent: 100,
    requestedAt: { day: 'd2ago', time: '21:42' },
    status: 'approved',
    handledBy: 'Daewi',
  },
]

// 기부 (Donation) 청구 시드. 길드원이 길드창에 기부한 실버를 포인트로 인정받는 건.
export type DemoDonationRequest = {
  id: string
  member: string
  silver: number
  points: number
  ratePercent: number
  requestedAt: DemoTimeLabel
  note: string
  status: DemoApprovalCommonStatus
  handledBy?: string
}

export const DEMO_DONATION_REQUESTS: DemoDonationRequest[] = [
  {
    id: 'dn-1',
    member: 'Daewi',
    silver: 5_000_000,
    points: 5_000,
    ratePercent: 100,
    requestedAt: { day: 'today', time: '13:02' },
    note: '주간 길드 운영자금',
    status: 'pending',
  },
  {
    id: 'dn-2',
    member: 'Eternia',
    silver: 2_500_000,
    points: 2_500,
    ratePercent: 100,
    requestedAt: { day: 'yesterday', time: '23:50' },
    note: '리기어 풀 보충',
    status: 'approved',
    handledBy: 'Daewi',
  },
  {
    id: 'dn-3',
    member: 'NebulaQ',
    silver: 800_000,
    points: 800,
    ratePercent: 100,
    requestedAt: { day: 'd3ago', time: '22:18' },
    note: '소규모 기부',
    status: 'approved',
    handledBy: 'Eternia',
  },
]

// 상점 주문 (Shop order) 시드. 포인트로 길드 상점 아이템을 구매한 건.
export type DemoShopOrder = {
  id: string
  member: string
  itemLabel: string
  itemEnchant: number
  quantity: number
  pointsTotal: number
  requestedAt: DemoTimeLabel
  status: DemoApprovalCommonStatus
  handledBy?: string
}

export const DEMO_SHOP_ORDERS: DemoShopOrder[] = [
  {
    id: 'so-1',
    member: 'Lumina',
    itemLabel: 'Holy Staff',
    itemEnchant: 3,
    quantity: 1,
    pointsTotal: 280,
    requestedAt: { day: 'today', time: '13:18' },
    status: 'pending',
  },
  {
    id: 'so-2',
    member: 'Borin',
    itemLabel: 'Heavy Mace',
    itemEnchant: 2,
    quantity: 2,
    pointsTotal: 320,
    requestedAt: { day: 'today', time: '12:55' },
    status: 'pending',
  },
  {
    id: 'so-3',
    member: 'Vexa',
    itemLabel: 'Heavy Crossbow',
    itemEnchant: 3,
    quantity: 1,
    pointsTotal: 240,
    requestedAt: { day: 'yesterday', time: '21:34' },
    status: 'approved',
    handledBy: 'Eternia',
  },
  {
    id: 'so-4',
    member: 'Mochi',
    itemLabel: 'Locus',
    itemEnchant: 2,
    quantity: 1,
    pointsTotal: 180,
    requestedAt: { day: 'd2ago', time: '20:12' },
    status: 'approved',
    handledBy: 'Daewi',
  },
]

export type DemoMemberTradeDispute = {
  id: string
  title: string
  buyer: string
  seller: string
  itemCount: number
  quantity: number
  totalPoints: number
  disputeReason: string
  requestedAt: DemoTimeLabel
  status: 'disputed' | 'completed' | 'refunded'
}

export const DEMO_MEMBER_TRADE_DISPUTES: DemoMemberTradeDispute[] = [
  {
    id: 'mt-1',
    title: 'Mistcaller .3 + Cleric Cowl .3',
    buyer: 'Lumina',
    seller: 'ShadowAce',
    itemCount: 2,
    quantity: 2,
    totalPoints: 640,
    disputeReason: '거래 완료 표시 후 아이템 전달 여부를 서로 다르게 주장하고 있습니다.',
    requestedAt: { day: 'today', time: '14:24' },
    status: 'disputed',
  },
  {
    id: 'mt-2',
    title: 'Heavy Mace .2',
    buyer: 'Mochi',
    seller: 'Borin',
    itemCount: 1,
    quantity: 1,
    totalPoints: 220,
    disputeReason: '구매자가 전달 전에 주문 취소를 요청했습니다.',
    requestedAt: { day: 'yesterday', time: '19:18' },
    status: 'refunded',
  },
]

// 이벤트 보상 (Event payout) 청구 시드. 이벤트 참여 보상 지급 청구.
export type DemoEventPayout = {
  id: string
  eventName: string
  eventTime: DemoTimeLabel
  participantCount: number
  pointsPerMember: number
  totalPoints: number
  requestedAt: DemoTimeLabel
  status: DemoApprovalCommonStatus
  handledBy?: string
}

export const DEMO_EVENT_PAYOUTS: DemoEventPayout[] = [
  {
    id: 'ep-1',
    eventName: 'Roads 7v7 — Mercia',
    eventTime: { day: 'yesterday', time: '22:00' },
    participantCount: 7,
    pointsPerMember: 200,
    totalPoints: 1_400,
    requestedAt: { day: 'today', time: '08:14' },
    status: 'pending',
  },
  {
    id: 'ep-2',
    eventName: 'Hellgate 4v4',
    eventTime: { day: 'd2ago', time: '22:14' },
    participantCount: 4,
    pointsPerMember: 150,
    totalPoints: 600,
    requestedAt: { day: 'yesterday', time: '09:00' },
    status: 'approved',
    handledBy: 'Eternia',
  },
]

// 청부 제작 (Craft order) 청구 시드. 크래프터가 발주받은 장비를 납품해 승인 받는 건.
export type DemoCraftOrder = {
  id: string
  crafter: string
  recipient: string
  itemLabel: string
  itemEnchant: number
  quantity: number
  silverPaid: number
  pointsCredited: number
  submittedAt: DemoTimeLabel
  status: DemoApprovalCommonStatus
  handledBy?: string
}

export const DEMO_CRAFT_ORDERS: DemoCraftOrder[] = [
  {
    id: 'co-1',
    crafter: 'Daewi',
    recipient: 'Eternia',
    itemLabel: 'Heavy Mace',
    itemEnchant: 3,
    quantity: 3,
    silverPaid: 180_000,
    pointsCredited: 240,
    submittedAt: { day: 'today', time: '14:02' },
    status: 'pending',
  },
  {
    id: 'co-2',
    crafter: 'MoonRabbit',
    recipient: 'Mochi',
    itemLabel: 'Holy Staff',
    itemEnchant: 3,
    quantity: 2,
    silverPaid: 120_000,
    pointsCredited: 160,
    submittedAt: { day: 'yesterday', time: '19:45' },
    status: 'approved',
    handledBy: 'Eternia',
  },
]

// 어드민 사이드바 배지 카운트. 데모는 pending 만 합산.
export const DEMO_ADMIN_BADGES = {
  regear: DEMO_REGEAR_LIST.filter((r) => r.status === 'pending').length,
  exchange: DEMO_EXCHANGE_REQUESTS.filter((r) => r.status === 'pending').length,
  donation: DEMO_DONATION_REQUESTS.filter((r) => r.status === 'pending').length,
  shop: DEMO_SHOP_ORDERS.filter((o) => o.status === 'pending').length,
  memberTrade: DEMO_MEMBER_TRADE_DISPUTES.filter((row) => row.status === 'disputed').length,
  eventPayout: DEMO_EVENT_PAYOUTS.filter((e) => e.status === 'pending').length,
  craft: DEMO_CRAFT_ORDERS.filter((c) => c.status === 'pending').length,
}
