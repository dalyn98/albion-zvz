'use server'

import { requireAdmin } from '@/lib/auth'
import { getTranslations } from 'next-intl/server'

export interface TopHolder {
  discordId: string
  username: string
  avatar: string | null
  isAdmin: boolean
  balance: number
}

export interface PointStats {
  // 길드원 모두의 현재 보유 포인트 합 — 곧 지급해야 할 '부채' 규모.
  totalHeld: number
  // 지금까지 지급된 포인트(리기어 승인 + 기부 승인 + admin_adjust 양수 등) 누적.
  lifetimeEarned: number
  // 지금까지 소비된 포인트(환전/상점/admin_adjust 음수 등) 누적 절대값.
  lifetimeSpent: number
  // 포인트 원장에 기록된 총 건수. 길드 활동량 지표.
  entriesCount: number
  memberCount: number
  topHolders: TopHolder[]
}

export async function getPointStats(): Promise<{ stats?: PointStats; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireAdmin()
    const [ledgerRes, avatarsRes] = await Promise.all([
      db.from('point_ledger').select('discord_id, delta'),
      db.from('guild_avatars').select('discord_id, username, avatar, is_admin'),
    ])
    if (ledgerRes.error) return { error: ledgerRes.error.message }
    if (avatarsRes.error) return { error: avatarsRes.error.message }

    const rows = ledgerRes.data ?? []
    const avatars = avatarsRes.data ?? []

    // discord_id → { balance, earned, spent } 집계.
    const balances = new Map<string, { balance: number; earned: number; spent: number }>()
    let lifetimeEarned = 0
    let lifetimeSpent = 0
    for (const row of rows) {
      const delta = Number(row.delta ?? 0)
      if (!Number.isFinite(delta)) continue
      const cur = balances.get(row.discord_id) ?? { balance: 0, earned: 0, spent: 0 }
      cur.balance += delta
      if (delta > 0) {
        cur.earned += delta
        lifetimeEarned += delta
      } else if (delta < 0) {
        cur.spent += -delta
        lifetimeSpent += -delta
      }
      balances.set(row.discord_id, cur)
    }

    // 이름/아바타 매칭 — 원장에만 있고 guild_avatars 에 없는 유저(탈퇴한 멤버)
    // 는 "이름 미상" 으로 떨어뜨리지만 합계에는 여전히 포함시킨다. 포인트
    // 부채는 discord_id 기준이지 avatar 동기화 상태에 의존하지 않기 때문.
    const avatarsByDiscord = new Map(avatars.map((a) => [a.discord_id, a]))

    const topHolders: TopHolder[] = []
    let totalHeld = 0
    for (const [discordId, v] of balances.entries()) {
      totalHeld += v.balance
      // 보유 포인트가 0 이하인 사람은 "top" 에서 제외 — 0 이면 표시 가치 없고,
      // 음수면 이상 상태(관리자 조정 중) 이므로 별도 섹션이 필요하면 추후에.
      if (v.balance <= 0) continue
      const a = avatarsByDiscord.get(discordId)
      topHolders.push({
        discordId,
        username: a?.username ?? '이름 미상',
        avatar: a?.avatar ?? null,
        isAdmin: a?.is_admin ?? false,
        balance: v.balance,
      })
    }
    topHolders.sort((a, b) => b.balance - a.balance)

    return {
      stats: {
        totalHeld,
        lifetimeEarned,
        lifetimeSpent,
        entriesCount: rows.length,
        memberCount: balances.size,
        topHolders: topHolders.slice(0, 50),
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}
