'use server'

// 길드 상자 재고 베이스라인. 인게임에서 "모든 아이템 출고 → 재입고" 한 로그를
// 받아 해당 시점의 재고 전체를 진실값으로 고정. migration 077 참고.
//
// 두 개의 엔드포인트:
//   - previewBaseline: 로그만 파싱해 미리보기 (DB 건드리지 않음)
//   - confirmBaseline: apply_shop_baseline RPC 호출 → 재고 리셋

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireAdmin } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { parseChestLog, type ChestLogEntry } from '@/lib/shop/parse-chest-log'
import { resolveKoItem } from '@/lib/shop/resolve-item'

export interface BaselineItem {
  uniqueName: string
  nameKo: string
  category: string | null
  tier: number | null
  enchant: number
  quality: number
  quantity: number
}

export interface BaselinePreview {
  // deposit 창
  baselineStart: string | null
  baselineAt: string | null
  // 입고 이벤트 건수 + 총 수량
  totalEvents: number
  totalItems: number
  // 애그리게이트 (수량 내림차순)
  items: BaselineItem[]
  // 처음/마지막 입고 이벤트 (사용자가 "이 지점 맞냐" 확인용)
  firstEvent: {
    at: string
    itemName: string
    quantity: number
    player: string
  } | null
  lastEvent: {
    at: string
    itemName: string
    quantity: number
    player: string
  } | null
  // 경고
  warnings: string[]
  // 현재 확정된 베이스라인 (rebaseline 중인지 확인용)
  currentBaseline: {
    confirmedAt: string
    baselineAt: string
    totalItems: number
  } | null
  // 해결 못한 아이템 이름 (중복 제거)
  unresolvedNames: string[]
  // 임포트 파싱 오류
  parseErrors: Array<{ line: number; text: string; reason: string }>
  // 참여자 (입고한 사람들)
  depositors: string[]
  error?: string
}

export interface BaselineConfirmResult {
  baselineId?: string
  appliedItems: number
  totalItems: number
  error?: string
}

const MAX_ENTRIES = 5000

// deposit 창의 entries 를 이름별로 묶어 수량 합산.
function aggregateDeposits(entries: ChestLogEntry[]): {
  items: BaselineItem[]
  unresolved: Set<string>
  totalItems: number
} {
  const bucket = new Map<string, BaselineItem>()
  const unresolved = new Set<string>()
  let totalItems = 0

  for (const e of entries) {
    if (e.quantity <= 0) continue
    const resolved = resolveKoItem(e.itemName)
    if (!resolved) {
      unresolved.add(e.itemName)
      continue
    }
    totalItems += e.quantity
    const key = `${resolved.uniqueName}|${e.enchant}|${e.quality}`
    const existing = bucket.get(key)
    if (existing) {
      existing.quantity += e.quantity
      continue
    }
    bucket.set(key, {
      uniqueName: resolved.uniqueName,
      nameKo: resolved.nameKo || e.itemName,
      category: resolved.category ?? null,
      tier: resolved.tier,
      enchant: e.enchant,
      quality: e.quality,
      quantity: e.quantity,
    })
  }

  const items = [...bucket.values()].sort((a, b) => b.quantity - a.quantity)
  return { items, unresolved, totalItems }
}

export async function previewBaseline(raw: string): Promise<BaselinePreview> {
  const tErr = await getTranslations('adminActionError')
  const empty: BaselinePreview = {
    baselineStart: null,
    baselineAt: null,
    totalEvents: 0,
    totalItems: 0,
    items: [],
    firstEvent: null,
    lastEvent: null,
    warnings: [],
    currentBaseline: null,
    unresolvedNames: [],
    parseErrors: [],
    depositors: [],
  }

  try {
    const session = await getSession()
    if (!session?.isAdmin) return { ...empty, error: 'Unauthorized' }
    const db = await requireAdmin()
    const guildId = await getSessionGuildId(session)

    const { entries, errors } = parseChestLog(raw)
    if (entries.length === 0) {
      return {
        ...empty,
        parseErrors: errors,
        error: errors.length
          ? tErr('importNoParseableRows')
          : tErr('importEmptyLog'),
      }
    }
    if (entries.length > MAX_ENTRIES) {
      return {
        ...empty,
        parseErrors: errors,
        error: tErr('importRowLimit', { max: MAX_ENTRIES, current: entries.length }),
      }
    }

    const deposits = entries.filter((e) => e.quantity > 0)
    const withdrawals = entries.filter((e) => e.quantity < 0)

    if (deposits.length === 0) {
      return { ...empty, parseErrors: errors, error: tErr('baselineNoDeposits') }
    }

    const sorted = [...deposits].sort(
      (a, b) => a.loggedAt.getTime() - b.loggedAt.getTime(),
    )
    const first = sorted[0]
    const last = sorted[sorted.length - 1]

    const { items, unresolved, totalItems } = aggregateDeposits(deposits)

    const depositorSet = new Set(deposits.map((e) => e.player))
    const depositors = [...depositorSet]

    const warnings: string[] = []
    if (depositors.length > 1) {
      warnings.push(
        `입고한 길드원이 ${depositors.length}명 (${depositors.slice(0, 3).join(', ')}${depositors.length > 3 ? '...' : ''}). 베이스라인은 혼자 입고할 때 가장 정확.`,
      )
    }
    // deposit 창 사이의 withdraw = 누군가 중간에 아이템 뺐다는 뜻
    const startMs = first.loggedAt.getTime()
    const endMs = last.loggedAt.getTime()
    const withdrawalsInWindow = withdrawals.filter((e) => {
      const t = e.loggedAt.getTime()
      return t >= startMs && t <= endMs
    })
    if (withdrawalsInWindow.length > 0) {
      warnings.push(
        `입고 창 사이에 ${withdrawalsInWindow.length}건의 출고 감지. 다른 길드원이 중간에 아이템을 꺼냈을 수 있어 베이스라인 정확도가 떨어질 수 있음.`,
      )
    }
    if (unresolved.size > 0) {
      warnings.push(
        `${unresolved.size}개 아이템 이름이 매핑되지 않아 스냅샷에서 제외됨. /admin/dashboard/shop 에서 name override 추가 후 다시 시도하세요.`,
      )
    }

    const { data: current } = await db
      .from('shop_baselines')
      .select('confirmed_at, baseline_at, total_items')
      .eq('guild_id', guildId)
      .eq('status', 'confirmed')
      .maybeSingle()

    const currentBaseline = current
      ? {
          confirmedAt: current.confirmed_at as string,
          baselineAt: current.baseline_at as string,
          totalItems: current.total_items as number,
        }
      : null

    return {
      baselineStart: first.loggedAt.toISOString(),
      baselineAt: last.loggedAt.toISOString(),
      totalEvents: deposits.length,
      totalItems,
      items,
      firstEvent: {
        at: first.loggedAt.toISOString(),
        itemName: first.itemName,
        quantity: first.quantity,
        player: first.player,
      },
      lastEvent: {
        at: last.loggedAt.toISOString(),
        itemName: last.itemName,
        quantity: last.quantity,
        player: last.player,
      },
      warnings,
      currentBaseline,
      unresolvedNames: [...unresolved],
      parseErrors: errors,
      depositors,
    }
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : 'Server error' }
  }
}

export async function confirmBaseline(input: {
  raw: string
  notes?: string
}): Promise<BaselineConfirmResult> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session?.isAdmin) return { appliedItems: 0, totalItems: 0, error: 'Unauthorized' }
    const db = await requireAdmin()
    const guildId = await getSessionGuildId(session)

    // preview 와 동일한 파싱 로직 재사용 (실제 적용 직전에 서버 측에서 다시 계산해
    // 클라가 조작한 값을 신뢰하지 않음).
    const preview = await previewBaseline(input.raw)
    if (preview.error) {
      return { appliedItems: 0, totalItems: 0, error: preview.error }
    }
    if (!preview.baselineAt || !preview.baselineStart || preview.items.length === 0) {
      return { appliedItems: 0, totalItems: 0, error: tErr('baselineNoDeposits') }
    }

    const depositor = preview.depositors.length === 1 ? preview.depositors[0] : null

    const { data: baselineId, error } = await db.rpc('apply_shop_baseline', {
      p_guild_id: guildId,
      p_baseline_at: preview.baselineAt,
      p_baseline_start: preview.baselineStart,
      p_snapshot: preview.items,
      p_total_items: preview.totalItems,
      p_total_events: preview.totalEvents,
      p_depositor: depositor,
      p_admin_id: session.discordId,
      p_notes: input.notes?.trim() || null,
    })
    if (error) {
      return { appliedItems: 0, totalItems: 0, error: error.message }
    }

    revalidatePath('/admin/dashboard/shop')
    revalidatePath('/admin/dashboard/shop/baseline')
    revalidatePath('/shop')

    return {
      baselineId: typeof baselineId === 'string' ? baselineId : undefined,
      appliedItems: preview.items.length,
      totalItems: preview.totalItems,
    }
  } catch (e) {
    return {
      appliedItems: 0,
      totalItems: 0,
      error: e instanceof Error ? e.message : 'Server error',
    }
  }
}
