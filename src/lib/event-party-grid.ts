import { getDisplayGear, SLOT_ROLES, type PartyWithSlots, type Slot, type SlotRole } from '@/types'

const ROLE_ORDER = new Map<string, number>(SLOT_ROLES.map((role, index) => [role, index]))
export const MOBILE_SLOT_COLUMN_OPTIONS = [1, 2] as const
export type MobileSlotColumns = (typeof MOBILE_SLOT_COLUMN_OPTIONS)[number]

const MOBILE_SLOT_GRID_CLASS: Record<MobileSlotColumns, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 min-[360px]:grid-cols-2',
}

export interface EventRoleAvailability {
  roleName: string | null
  total: number
  applied: number
  assigned: number
  pending: number
  remaining: number
  appliedRate: number
}

export interface EventArmorShare {
  count: number
  total: number
}

export interface EventGridPartyFilterOptions {
  currentDiscordId: string | null
  onlyMyRole: boolean
  myRoleName: string | null
  openOnly: boolean
  roleFilter: SlotRole | ''
  suggestedOnly: boolean
  suggestedRoles: readonly SlotRole[]
}

function isAssignedBombSquadCaller(
  party: PartyWithSlots,
  currentDiscordId: string | null,
): boolean {
  return Boolean(
    party.is_bomb_squad &&
      currentDiscordId &&
      party.caller_discord_id &&
      party.caller_discord_id === currentDiscordId,
  )
}

export function getEventGridMyRoleName(
  parties: readonly PartyWithSlots[],
  currentDiscordId: string | null,
): string | null {
  if (!currentDiscordId) return null
  for (const party of parties) {
    for (const slot of party.slots) {
      if (slot.assigned_discord_id === currentDiscordId && slot.role_name) {
        return slot.role_name
      }
    }
  }
  return null
}

export function isEventSlotApplied(
  slot: Pick<Slot, 'assigned_discord_id' | 'requested_discord_id'>,
): boolean {
  return !!slot.assigned_discord_id || !!slot.requested_discord_id
}

export function parseMobileSlotColumns(value: string | null): MobileSlotColumns | null {
  if (value === '4') return 2
  const parsed = Number(value)
  return MOBILE_SLOT_COLUMN_OPTIONS.includes(parsed as MobileSlotColumns)
    ? parsed as MobileSlotColumns
    : null
}

export function getMobileSlotGridClass(columns: MobileSlotColumns): string {
  return MOBILE_SLOT_GRID_CLASS[columns]
}

export function summarizeEventArmorShare(
  parties: readonly PartyWithSlots[],
  keywords: readonly string[],
): EventArmorShare {
  const normalizedKeywords = keywords.map((keyword) => keyword.toLowerCase())
  let total = 0
  let count = 0

  for (const party of parties) {
    for (const slot of party.slots) {
      // Only confirmed applicants are part of the live armor mix. Empty slots
      // are planning data and would make the denominator look fuller than the
      // field actually is.
      if (!slot.assigned_discord_id) continue
      total++

      const armorName = getDisplayGear(slot, 'armor').name
      const normalizedArmorName = armorName?.toLowerCase()
      if (
        normalizedArmorName &&
        normalizedKeywords.some((keyword) => normalizedArmorName.includes(keyword))
      ) {
        count++
      }
    }
  }

  return { count, total }
}

export function summarizeEventRoleAvailability(
  parties: readonly PartyWithSlots[],
): EventRoleAvailability[] {
  const rows = new Map<string, EventRoleAvailability>()

  for (const party of parties) {
    for (const slot of party.slots) {
      const key = slot.role_name ?? ''
      const current = rows.get(key) ?? {
        roleName: slot.role_name,
        total: 0,
        applied: 0,
        assigned: 0,
        pending: 0,
        remaining: 0,
        appliedRate: 0,
      }
      const isAssigned = !!slot.assigned_discord_id
      const isPending = !isAssigned && !!slot.requested_discord_id
      const total = current.total + 1
      const applied = current.applied + (isAssigned || isPending ? 1 : 0)
      rows.set(key, {
        ...current,
        total,
        applied,
        assigned: current.assigned + (isAssigned ? 1 : 0),
        pending: current.pending + (isPending ? 1 : 0),
        remaining: total - applied,
        appliedRate: Math.round((applied / total) * 100),
      })
    }
  }

  return Array.from(rows.values()).sort((a, b) => {
    const aRole = a.roleName ?? ''
    const bRole = b.roleName ?? ''
    if (!aRole && bRole) return 1
    if (aRole && !bRole) return -1
    if (!aRole && !bRole) return 0

    const aOrder = ROLE_ORDER.get(aRole) ?? Number.MAX_SAFE_INTEGER
    const bOrder = ROLE_ORDER.get(bRole) ?? Number.MAX_SAFE_INTEGER
    if (aOrder !== bOrder) return aOrder - bOrder
    return aRole.localeCompare(bRole)
  })
}

export function filterEventGridParties(
  parties: readonly PartyWithSlots[],
  options: EventGridPartyFilterOptions,
): PartyWithSlots[] {
  const suggestedSet = new Set(options.suggestedRoles)
  return parties.flatMap((party) => {
    const slots = party.slots.filter((slot) => {
      if (options.onlyMyRole && options.myRoleName && slot.role_name !== options.myRoleName) {
        return false
      }
      if (options.openOnly && isEventSlotApplied(slot)) return false
      if (options.roleFilter && slot.role_name !== options.roleFilter) return false
      if (
        options.suggestedOnly &&
        suggestedSet.size > 0 &&
        !suggestedSet.has(slot.role_name as SlotRole)
      ) {
        return false
      }
      return true
    })

    if (slots.length > 0) return [{ ...party, slots }]
    if (isAssignedBombSquadCaller(party, options.currentDiscordId)) {
      return [{ ...party, slots }]
    }
    return []
  })
}
