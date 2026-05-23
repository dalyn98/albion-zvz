import { getTranslations } from 'next-intl/server'
import type { PartyWithSlots, Slot, SlotKey } from '@/types'
import { getPrimaryGearKind, getRoleStyle } from '@/types'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import { stripTierPrefix } from '@/lib/weapon-display'
import ItemImage from './ItemImage'

interface Props {
  parties: PartyWithSlots[]
  mode: 'build_sheet' | 'hybrid'
}

interface BuildGroup {
  key: string
  roleName: string | null
  itemName: string | null
  itemId: string | null
  count: number
}

function primaryItem(slot: Slot): { kind: SlotKey; name: string | null; id: string | null } {
  const kind = getPrimaryGearKind(slot.role_name)
  const row = slot as unknown as Record<string, string | null>
  return {
    kind,
    name: row[`${kind}_name`] ?? null,
    id: row[`${kind}_id`] ?? null,
  }
}

function buildGroups(parties: PartyWithSlots[]): BuildGroup[] {
  const groups = new Map<string, BuildGroup>()
  for (const party of parties) {
    for (const slot of party.slots) {
      if (slot.is_hidden) continue
      const item = primaryItem(slot)
      const key = `${slot.role_name ?? ''}:${item.id ?? item.name ?? ''}`
      const existing = groups.get(key)
      if (existing) {
        groups.set(key, { ...existing, count: existing.count + 1 })
      } else {
        groups.set(key, {
          key,
          roleName: slot.role_name,
          itemName: item.name,
          itemId: item.id,
          count: 1,
        })
      }
    }
  }
  return Array.from(groups.values()).sort((a, b) => b.count - a.count)
}

export default async function EventBuildSheetSummary({ parties, mode }: Props) {
  const [t, tRole] = await Promise.all([
    getTranslations('event'),
    getTranslations('slotRole'),
  ])
  const groups = buildGroups(parties)
  if (groups.length === 0) return null

  return (
    <section className="rounded-2xl border border-sky-500/25 bg-sky-500/10 p-4 sm:p-5 space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-sky-200">
          {t(`recruitmentMode.${mode}.eyebrow`)}
        </p>
        <h2 className="mt-1 text-base font-bold text-white">{t('buildSheetTitle')}</h2>
        <p className="mt-1 text-sm leading-relaxed text-sky-100/80">{t(`recruitmentMode.${mode}.body`)}</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
        {groups.slice(0, 12).map((group) => {
          const roleStyle = getRoleStyle(group.roleName)
          return (
            <a
              key={group.key}
              href="#event-slots"
              className="rounded-lg border border-white/10 bg-gray-950/45 p-2 transition-colors hover:border-sky-400/50"
            >
              <div className="flex items-center gap-2">
                {group.itemId ? (
                  <ItemImage itemId={group.itemId} itemName={stripTierPrefix(group.itemName ?? '')} size={34} hoverPreview />
                ) : (
                  <div className="h-[34px] w-[34px] rounded bg-gray-800 border border-gray-700" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-white">
                    {stripTierPrefix(group.itemName ?? '') || t('buildSheetNoItem')}
                  </p>
                  <div className="mt-1 flex items-center gap-1">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        roleStyle ? roleStyle.badge : 'border border-gray-700 bg-gray-800 text-gray-300'
                      }`}
                    >
                      {group.roleName ? translateSlotRole(group.roleName, tRole) : t('buildSheetNoRole')}
                    </span>
                    <span className="text-[10px] font-mono text-gray-400">x{group.count}</span>
                  </div>
                </div>
              </div>
            </a>
          )
        })}
      </div>
    </section>
  )
}
