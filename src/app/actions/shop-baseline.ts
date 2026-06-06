'use server'

// 길드 상자 재고 베이스라인. 인게임에서 "모든 아이템 출고 → 재입고" 한 로그를
// 받아 해당 시점의 재고 전체를 진실값으로 고정. migration 077 참고.
//
// 두 개의 엔드포인트:
//   - previewBaseline: 로그만 파싱해 미리보기 (DB 건드리지 않음)
//   - confirmBaseline: apply_shop_baseline RPC 호출 → 재고 리셋

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireAnyCapability } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { parseChestLog, type ChestLogEntry } from '@/lib/shop/parse-chest-log'
import { resolveKoItem } from '@/lib/shop/resolve-item'
import { logAdminAction } from '@/lib/admin-audit'
import { CAP } from '@/lib/permissions'
import { canonicalShopQuality, shopSkuKey } from '@/lib/shop/quality'

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

export interface DriftChange {
  uniqueName: string
  nameKo: string | null
  enchant: number
  quality: number
  beforeStock: number
  afterStock: number
  delta: number
}

export interface DriftReport {
  beforeTotal: number
  afterTotal: number
  changedItems: number
  restored: number
  cleared: number
  increased: number
  decreased: number
  topChanges: DriftChange[]
}

export interface BaselineConfirmResult {
  baselineId?: string
  appliedItems: number
  totalItems: number
  driftReport: DriftReport | null
  error?: string
}

const MAX_ENTRIES = 5000
const BASELINE_CAPS = [CAP.INVENTORY_MANAGE, CAP.CHEST_LOG_PASTE] as const

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
    const key = shopSkuKey({ uniqueName: resolved.uniqueName, enchant: e.enchant })
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
      quality: canonicalShopQuality(),
      quantity: e.quantity,
    })
  }

  const items = [...bucket.values()].sort((a, b) => b.quantity - a.quantity)
  return { items, unresolved, totalItems }
}

export async function previewBaseline(raw: string): Promise<BaselinePreview> {
  const tErr = await getTranslations('adminActionError')
  const tWarn = await getTranslations('shopBaselineForm')
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
    if (!session) return { ...empty, error: 'Unauthorized' }
    const db = await requireAnyCapability(BASELINE_CAPS)
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
      const sample = depositors.slice(0, 3).join(', ') + (depositors.length > 3 ? '...' : '')
      warnings.push(
        tWarn('warnMultipleDepositors', { count: depositors.length, names: sample }),
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
        tWarn('warnWithdrawalsInWindow', { count: withdrawalsInWindow.length }),
      )
    }
    if (unresolved.size > 0) {
      warnings.push(tWarn('warnUnresolvedItems', { count: unresolved.size }))
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

// RPC 가 저장한 drift_report 를 읽어 카멜케이스로 normalize.
async function fetchDriftReport(
  db: Awaited<ReturnType<typeof requireAnyCapability>>,
  guildId: string,
  baselineId: string,
): Promise<DriftReport | null> {
  const { data } = await db
    .from('shop_baselines')
    .select('drift_report')
    .eq('guild_id', guildId)
    .eq('id', baselineId)
    .maybeSingle()
  const raw = data?.drift_report as Record<string, unknown> | null | undefined
  if (!raw) return null
  const topChangesRaw = Array.isArray(raw.top_changes) ? raw.top_changes : []
  const topChanges: DriftChange[] = topChangesRaw.map((c) => {
    const obj = c as Record<string, unknown>
    return {
      uniqueName: String(obj.unique_name ?? ''),
      nameKo: (obj.name_ko as string | null) ?? null,
      enchant: Number(obj.enchant ?? 0),
      quality: Number(obj.quality ?? 0),
      beforeStock: Number(obj.before_stock ?? 0),
      afterStock: Number(obj.after_stock ?? 0),
      delta: Number(obj.delta ?? 0),
    }
  })
  return {
    beforeTotal: Number(raw.before_total ?? 0),
    afterTotal: Number(raw.after_total ?? 0),
    changedItems: Number(raw.changed_items ?? 0),
    restored: Number(raw.restored ?? 0),
    cleared: Number(raw.cleared ?? 0),
    increased: Number(raw.increased ?? 0),
    decreased: Number(raw.decreased ?? 0),
    topChanges,
  }
}

export async function confirmBaseline(input: {
  raw: string
  notes?: string
}): Promise<BaselineConfirmResult> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session)
      return { appliedItems: 0, totalItems: 0, driftReport: null, error: 'Unauthorized' }
    const db = await requireAnyCapability(BASELINE_CAPS)
    const guildId = await getSessionGuildId(session)

    // preview 와 동일한 파싱 로직 재사용 (실제 적용 직전에 서버 측에서 다시 계산해
    // 클라가 조작한 값을 신뢰하지 않음).
    const preview = await previewBaseline(input.raw)
    if (preview.error) {
      return { appliedItems: 0, totalItems: 0, driftReport: null, error: preview.error }
    }
    if (!preview.baselineAt || !preview.baselineStart || preview.items.length === 0) {
      return {
        appliedItems: 0,
        totalItems: 0,
        driftReport: null,
        error: tErr('baselineNoDeposits'),
      }
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
      return { appliedItems: 0, totalItems: 0, driftReport: null, error: error.message }
    }

    const id = typeof baselineId === 'string' ? baselineId : undefined
    const driftReport = id ? await fetchDriftReport(db, guildId, id) : null

    revalidatePath('/admin/dashboard/shop')
    revalidatePath('/admin/dashboard/shop/baseline')
    revalidatePath('/shop')

    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'shop.item.update',
      targetId: id ?? null,
      targetKind: 'shop_item',
      details: {
        kind: 'baseline.apply',
        appliedItems: preview.items.length,
        totalItems: preview.totalItems,
        notes: input.notes?.trim() || null,
      },
    })

    return {
      baselineId: id,
      appliedItems: preview.items.length,
      totalItems: preview.totalItems,
      driftReport,
    }
  } catch (e) {
    return {
      appliedItems: 0,
      totalItems: 0,
      driftReport: null,
      error: e instanceof Error ? e.message : 'Server error',
    }
  }
}
