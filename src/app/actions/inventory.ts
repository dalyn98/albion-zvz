'use server'


import { publicActionError } from '@/lib/public-action-error'
// Guild equipment inventory server actions.
//
// Surface area: list snapshot + manual adjust(+/-) + manual set(absolute) for
// finished gear. 정련 재료 트래킹은 마이그 112 에서 폐기되어 제거됨.
// 자동 -1 훅 (deliver 시) 은 craft.ts 에서 직접 decrementBuildForDelivery
// 를 호출.
//
// 권한: 어드민 + 제작자(`guild_avatars.is_crafter = true`). 제작자는 자기
// 제작 흐름과 직결되는 재고를 직접 손볼 수 있어야 한다는 정책.

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import {
  adjustInventoryGear,
  setInventoryGear,
  categorizeGearItem,
} from '@/lib/inventory'

// 완제품 재고는 진짜 "장비" 만 허용. 재료·아티팩트·토큰·마운트·식량은
// 도메인 밖이라 같은 테이블에 섞이면 카운트가 의미를 잃는다.
function isGearItemId(itemId: string): boolean {
  const cat = categorizeGearItem(itemId)
  return cat.slot !== 'other'
}

// 어드민 또는 제작자만 재고 편집 가능. 제작자 판단은 guild_avatars.is_crafter.
async function requireCrafterOrAdmin(): Promise<{
  guildId: string
  discordId: string
} | { error: string }> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) return { error: tErr('loginRequired') }
  const guildId = await getSessionGuildId(session)
  if (session.isAdmin) return { guildId, discordId: session.discordId }

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
  return { error: tErr('crafterOnly') }
}

const REVALIDATE_PATHS = ['/admin/dashboard/inventory', '/inventory'] as const

function revalidateAll() {
  for (const path of REVALIDATE_PATHS) revalidatePath(path)
}

export async function adjustGearAction(input: {
  itemId: string
  delta: number
}): Promise<{ quantity?: number; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const auth = await requireCrafterOrAdmin()
    if ('error' in auth) return { error: auth.error }

    if (!input.itemId || input.itemId.trim().length === 0) {
      return { error: tErr('inventoryItemEmpty') }
    }
    if (!isGearItemId(input.itemId.trim())) {
      return { error: tErr('inventoryNotGearItem') }
    }
    if (!Number.isInteger(input.delta) || input.delta === 0) {
      return { error: tErr('inventoryInvalidDelta') }
    }

    const qty = await adjustInventoryGear(auth.guildId, input.itemId.trim(), input.delta, auth.discordId)
    revalidateAll()
    return { quantity: qty }
  } catch (e) {
    return { error: await publicActionError(e, 'actions/inventory') }
  }
}

export async function setGearAction(input: {
  itemId: string
  quantity: number
}): Promise<{ quantity?: number; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const auth = await requireCrafterOrAdmin()
    if ('error' in auth) return { error: auth.error }

    if (!input.itemId || input.itemId.trim().length === 0) {
      return { error: tErr('inventoryItemEmpty') }
    }
    if (!isGearItemId(input.itemId.trim())) {
      return { error: tErr('inventoryNotGearItem') }
    }
    if (!Number.isInteger(input.quantity) || input.quantity < 0) {
      return { error: tErr('inventoryInvalidQuantity') }
    }

    const qty = await setInventoryGear(auth.guildId, input.itemId.trim(), input.quantity, auth.discordId)
    revalidateAll()
    return { quantity: qty }
  } catch (e) {
    return { error: await publicActionError(e, 'actions/inventory') }
  }
}
