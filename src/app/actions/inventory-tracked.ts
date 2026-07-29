'use server'


import { publicActionError } from '@/lib/public-action-error'
// 길드 단위 "추적 중인 장비 베이스" 관리 액션.
//
// guild_tracked_inventory_items (마이그 124) 의 CRUD + 자동완성 검색.
// 추적 등록은 base_suffix 단위 (예: "2H_HOLYSTAFF", "HEAD_PLATE_SET3").
// 각 추적 row 가 그리드에서 T4~T8 다섯 카드로 펼쳐진다.
//
// 권한: 어드민 + 제작자(`guild_avatars.is_crafter`). 일반 멤버는 read-only.

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getSession, sessionHas } from '@/lib/session'
import { requireLiveSession } from '@/lib/auth'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import { CAP } from '@/lib/permissions'
import {
  searchTrackedItems,
  getEntryBySuffix,
  type TrackedItemSearchEntry,
} from '@/lib/inventory-name-search'
import { categorizeGearItem } from '@/lib/inventory'

interface TrackedRow {
  base_suffix: string
  sort_order: number
  created_at: string
}

const REVALIDATE_PATHS = ['/admin/dashboard/inventory', '/inventory'] as const

function revalidateAll() {
  for (const path of REVALIDATE_PATHS) revalidatePath(path)
}

async function requireCrafterOrAdmin(): Promise<{
  guildId: string
  discordId: string
} | { error: string }> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) return { error: tErr('loginRequired') }
  const guildId = await getSessionGuildId(session)

  const db = getAdminClient()
  const { data } = await db
    .from('guild_avatars')
    .select('is_crafter')
    .eq('guild_id', guildId)
    .eq('discord_id', session.discordId)
    .maybeSingle()
  if ((data?.is_crafter as boolean | undefined) === true) {
    return { guildId, discordId: session.discordId }
  }
  const liveSession = await requireLiveSession().catch(() => null)
  if (
    liveSession &&
    sessionHas(liveSession, CAP.INVENTORY_MANAGE)
  ) {
    return {
      guildId: await getSessionGuildId(liveSession),
      discordId: liveSession.discordId,
    }
  }
  return { error: tErr('crafterOnly') }
}

// 인벤토리 페이지 로드 시 호출. 길드의 추적 등록 목록 + 표시용 메타정보.
export async function listTrackedItems(guildId: string): Promise<
  Array<TrackedItemSearchEntry & { sortOrder: number }>
> {
  const db = getAdminClient()
  const { data, error } = await db
    .from('guild_tracked_inventory_items')
    .select('base_suffix, sort_order, created_at')
    .eq('guild_id', guildId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)

  const rows = (data ?? []) as TrackedRow[]
  const out: Array<TrackedItemSearchEntry & { sortOrder: number }> = []
  for (const row of rows) {
    const entry = getEntryBySuffix(row.base_suffix)
    if (!entry) continue
    out.push({ ...entry, sortOrder: row.sort_order })
  }
  return out
}

export async function searchTrackedItemsAction(
  input: { query: string },
): Promise<{ results?: TrackedItemSearchEntry[]; error?: string }> {
  try {
    const auth = await requireCrafterOrAdmin()
    if ('error' in auth) return { error: auth.error }
    const query = (input.query ?? '').trim()
    if (query.length === 0) return { results: [] }
    return { results: searchTrackedItems(query, 30) }
  } catch (e) {
    return { error: await publicActionError(e, 'actions/inventory-tracked') }
  }
}

export async function addTrackedItemAction(
  input: { baseSuffix: string },
): Promise<{ added?: boolean; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const auth = await requireCrafterOrAdmin()
    if ('error' in auth) return { error: auth.error }

    const suffix = (input.baseSuffix ?? '').trim()
    if (!suffix) return { error: tErr('inventoryItemEmpty') }

    // suffix 가 인덱스에 존재하는지 확인 (조작/오타 방어).
    const entry = getEntryBySuffix(suffix)
    if (!entry) return { error: tErr('inventoryNotGearItem') }

    const db = getAdminClient()
    const { error } = await db
      .from('guild_tracked_inventory_items')
      .upsert(
        {
          guild_id: auth.guildId,
          base_suffix: suffix,
          sort_order: 0,
        },
        { onConflict: 'guild_id,base_suffix', ignoreDuplicates: true },
      )
    if (error) throw new Error(error.message)
    revalidateAll()
    return { added: true }
  } catch (e) {
    return { error: await publicActionError(e, 'actions/inventory-tracked') }
  }
}

export async function removeTrackedItemAction(
  input: { baseSuffix: string },
): Promise<{ removed?: boolean; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const auth = await requireCrafterOrAdmin()
    if ('error' in auth) return { error: auth.error }

    const suffix = (input.baseSuffix ?? '').trim()
    if (!suffix) return { error: tErr('inventoryItemEmpty') }

    const db = getAdminClient()
    const { error } = await db
      .from('guild_tracked_inventory_items')
      .delete()
      .eq('guild_id', auth.guildId)
      .eq('base_suffix', suffix)
    if (error) throw new Error(error.message)
    revalidateAll()
    return { removed: true }
  } catch (e) {
    return { error: await publicActionError(e, 'actions/inventory-tracked') }
  }
}

// 어드민이 한 번 클릭. 현재 guild_inventory_gear 에 quantity > 0 인 itemId
// 들의 base_suffix 를 모아 추적 리스트에 일괄 등록 (idempotent).
// 자동 cross-tenant 마이그가 아니라 옵트인 — 신규 길드는 빈 상태 유지.
export async function importTrackedFromExistingInventoryAction(): Promise<{
  added?: number
  error?: string
}> {
  try {
    const auth = await requireCrafterOrAdmin()
    if ('error' in auth) return { error: auth.error }

    const db = getAdminClient()
    const { data, error } = await db
      .from('guild_inventory_gear')
      .select('item_id, quantity')
      .eq('guild_id', auth.guildId)
      .gt('quantity', 0)
    if (error) throw new Error(error.message)

    const suffixes = new Set<string>()
    for (const row of data ?? []) {
      const itemId = row.item_id as string
      const baseId = itemId.split('@')[0]
      const cat = categorizeGearItem(baseId)
      if (cat.slot === 'other') continue
      if (cat.slot === 'cape' || cat.slot === 'bag') continue
      const suffix = baseId.replace(/^T\d+_/, '')
      // 인덱스에 없는 suffix (제외 패턴 등) 는 건너뜀.
      if (!getEntryBySuffix(suffix)) continue
      suffixes.add(suffix)
    }

    if (suffixes.size === 0) {
      revalidateAll()
      return { added: 0 }
    }

    const rows = [...suffixes].map((suffix) => ({
      guild_id: auth.guildId,
      base_suffix: suffix,
      sort_order: 0,
    }))
    const { error: upErr } = await db
      .from('guild_tracked_inventory_items')
      .upsert(rows, {
        onConflict: 'guild_id,base_suffix',
        ignoreDuplicates: true,
      })
    if (upErr) throw new Error(upErr.message)
    revalidateAll()
    return { added: suffixes.size }
  } catch (e) {
    return { error: await publicActionError(e, 'actions/inventory-tracked') }
  }
}
