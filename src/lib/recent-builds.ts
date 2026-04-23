import type { SlotTemplateData } from '@/app/actions/slot-templates'

// Browser-local recent-builds cache. Auto-populated when an admin finishes a
// slot edit in SlotEditor — no server round-trip, no per-user scoping (the
// browser session is the scope). Separate from the slot_templates DB table,
// which is the long-lived, named-template feature.

const STORAGE_KEY = 'app.recentBuilds.v1'
const MAX_RECENT = 5

export interface RecentBuild {
  // Random id so the UI can key list items independently of timestamps (two
  // builds saved in the same millisecond still deduplicate cleanly).
  id: string
  created_at: string
  data: SlotTemplateData
}

function isRecentBuild(value: unknown): value is RecentBuild {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.created_at === 'string' &&
    !!v.data &&
    typeof v.data === 'object'
  )
}

export function loadRecentBuilds(): RecentBuild[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isRecentBuild).slice(0, MAX_RECENT)
  } catch {
    return []
  }
}

function persist(list: RecentBuild[]) {
  if (typeof window === 'undefined') return
  try {
    if (list.length === 0) {
      window.localStorage.removeItem(STORAGE_KEY)
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
    }
  } catch {
    // Storage may be unavailable (private mode, quota). Silently give up —
    // the feature is best-effort convenience, not load-bearing.
  }
}

// A build is "worth saving" only when the weapon slot has something picked
// (fixed id or an options list). Otherwise the entry would be a shell with
// no distinguishing content.
export function hasWeaponContent(data: SlotTemplateData): boolean {
  if (data.weapon_id && data.weapon_id.trim().length > 0) return true
  if (Array.isArray(data.weapon_options) && data.weapon_options.length > 0) return true
  return false
}

// Cheap structural fingerprint — two builds are "the same" when all gear slots
// (fixed ids, options, specs, spells, role, notes) serialize identically.
function fingerprint(data: SlotTemplateData): string {
  return JSON.stringify({
    role: data.role_name ?? '',
    notes: data.notes ?? '',
    specs: data.gear_specs ?? null,
    spells: data.spells ?? null,
    weapon: [data.weapon_id, data.weapon_options],
    head: [data.head_id, data.head_options],
    armor: [data.armor_id, data.armor_options],
    shoes: [data.shoes_id, data.shoes_options],
    offhand: [data.offhand_id, data.offhand_options],
    potion: [data.potion_id, data.potion_options],
    food: [data.food_id, data.food_options],
    cape: [data.cape_id, data.cape_options],
    mount: [data.mount_id ?? null, data.mount_options ?? null],
  })
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function saveRecentBuild(data: SlotTemplateData): RecentBuild[] {
  if (!hasWeaponContent(data)) return loadRecentBuilds()
  const current = loadRecentBuilds()
  const fp = fingerprint(data)
  // Drop any existing entry with the same fingerprint so the most-recent copy
  // moves to the top instead of piling up.
  const deduped = current.filter((b) => fingerprint(b.data) !== fp)
  const next: RecentBuild[] = [
    { id: randomId(), created_at: new Date().toISOString(), data },
    ...deduped,
  ].slice(0, MAX_RECENT)
  persist(next)
  return next
}

export function removeRecentBuild(id: string): RecentBuild[] {
  const current = loadRecentBuilds()
  const next = current.filter((b) => b.id !== id)
  persist(next)
  return next
}

// Title for display: prefer the weapon's localized name when bundled, then
// the first option's name, then the template's role_name, then a generic
// fallback. Caller can still override with a custom formatter.
export function getBuildWeaponSample(data: SlotTemplateData): {
  id: string | null
  name: string | null
} {
  if (data.weapon_id && data.weapon_id.trim().length > 0) {
    return { id: data.weapon_id, name: data.weapon_name ?? null }
  }
  const first = data.weapon_options?.[0]
  if (first) return { id: first.id || null, name: first.name || null }
  return { id: null, name: null }
}
