// Static reference table of crafting return-rate presets that the crafter can
// pick from when filling in a craft task delivery. The actual effective return
// rate depends on city specialization, hideout quality/level/territory, and
// focus usage — exposing the full matrix in code would be hard to keep current
// with patches. Instead, the crafter chooses the preset that matches where
// they actually crafted (or types in a custom percent).
//
// The numbers below are conservative defaults; admins can override per-tenant
// via app_settings.craft_focus_bonus_pct if their guild's mastery loadout
// produces different focus bonuses.

export interface CraftLocationPreset {
  // Stable id used in UI dropdowns + craft_tasks.craft_city.
  id: string
  // i18n key under `craftRegear.location.{id}`.
  i18nKey: string
  // Effective material return rate in percent (without focus). Crafters can
  // override at submit time if their actual location differs.
  defaultReturnRatePct: number
}

export const CRAFT_LOCATION_PRESETS: readonly CraftLocationPreset[] = [
  { id: 'royal_city',     i18nKey: 'royalCity',    defaultReturnRatePct: 15.2 },
  { id: 'caerleon',       i18nKey: 'caerleon',     defaultReturnRatePct: 0 },
  { id: 'hideout_t5',     i18nKey: 'hideoutT5',    defaultReturnRatePct: 20 },
  { id: 'hideout_t8',     i18nKey: 'hideoutT8',    defaultReturnRatePct: 30 },
  { id: 'custom',         i18nKey: 'custom',       defaultReturnRatePct: 0 },
] as const

// Default focus bonus when the crafter ticks "focus used". Stacks additively
// with the location return rate — 15.2% city + 35% focus = 50.2% effective.
// Real game mechanics are slightly more nuanced (return rate is per-material
// roll), but the additive approximation is within a few percent for common
// cases and avoids exposing per-material complexity to the UI.
export const DEFAULT_FOCUS_BONUS_PCT = 35

// Cap effective return at 95% so net silver never falls below 5% of gross.
// Prevents broken tasks if the crafter inputs implausible values.
export const MAX_EFFECTIVE_RETURN_PCT = 95

export function clampReturnRate(pct: number): number {
  if (!Number.isFinite(pct)) return 0
  if (pct < 0) return 0
  if (pct > MAX_EFFECTIVE_RETURN_PCT) return MAX_EFFECTIVE_RETURN_PCT
  return pct
}

export function effectiveReturnRate(
  locationPct: number,
  focusUsed: boolean,
  focusBonusPct: number = DEFAULT_FOCUS_BONUS_PCT,
): number {
  const combined = locationPct + (focusUsed ? focusBonusPct : 0)
  return clampReturnRate(combined)
}
