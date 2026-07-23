'use client'

import { ChevronDown, ChevronUp, Users, Swords } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { isLocale, DEFAULT_LOCALE, type Locale } from '@/i18n/locales'
import {
  getRoleStyle,
  getPrimaryGearKind,
  isFreeItem,
  type SlotKey,
} from '@/types'
import { stripTierPrefix } from '@/lib/weapon-display'
import { useItemNameResolver } from '@/lib/item-names-client'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import ItemImage from './ItemImage'
import type { SlotInput } from './SlotEditor'

interface PartyState {
  party_number: number
  slots: SlotInput[]
}

type Placement = 'mobile' | 'desktop'

interface Props {
  parties: PartyState[]
  placement: Placement
}

function countSlots(parties: PartyState[]): number {
  return parties.reduce((sum, p) => sum + p.slots.length, 0)
}

export default function TemplatePartyListSidebar({ parties, placement }: Props) {
  const t = useTranslations('adminTemplates')
  const tRole = useTranslations('slotRole')
  const tSlot = useTranslations('slot')
  const rawLocale = useLocale()
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE
  const total = countSlots(parties)

  if (placement === 'mobile') {
    return (
      <details className="group bg-gray-900 border border-gray-800 rounded-xl">
        <summary className="w-full flex items-center justify-between gap-3 px-3 py-2.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <div className="flex items-center gap-2 min-w-0">
            <Users size={14} className="text-amber-400 flex-shrink-0" />
            <span className="text-white text-sm font-bold truncate">
              {t('sidebarTitle')}
            </span>
            <span className="text-gray-400 text-sm tabular-nums flex-shrink-0">
              {total}
            </span>
          </div>
          <div className="flex items-center gap-1 text-gray-500 text-[12px] flex-shrink-0">
            <span className="group-open:hidden">{t('sidebarExpand')}</span>
            <span className="hidden group-open:inline">{t('sidebarCollapse')}</span>
            <ChevronDown size={14} className="text-gray-400 group-open:hidden" />
            <ChevronUp size={14} className="text-gray-400 hidden group-open:block" />
          </div>
        </summary>
        <div className="max-h-[50dvh] overflow-y-auto overscroll-contain border-t border-gray-800 p-2">
          <SidebarList
            parties={parties}
            translateRole={(role) => translateSlotRole(role, tRole)}
            tFreeLabel={tSlot('free')}
            tMultiWeapon={(n) => t('sidebarMultiWeapon', { n })}
            tEmpty={t('sidebarEmpty')}
            tUnassignedRole={t('sidebarRoleUnassigned')}
            locale={locale}
          />
        </div>
      </details>
    )
  }

  return (
    <div className="sticky top-4 flex flex-col max-h-[calc(100vh-2rem)] bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Users size={14} className="text-amber-400 flex-shrink-0" />
          <span className="text-white text-sm font-bold truncate">{t('sidebarTitle')}</span>
        </div>
        <span className="text-gray-400 text-sm tabular-nums">{total}</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-2">
        <SidebarList
          parties={parties}
          translateRole={(role) => translateSlotRole(role, tRole)}
          tFreeLabel={tSlot('free')}
          tMultiWeapon={(n) => t('sidebarMultiWeapon', { n })}
          tEmpty={t('sidebarEmpty')}
          tUnassignedRole={t('sidebarRoleUnassigned')}
          locale={locale}
        />
      </div>
    </div>
  )
}

interface SidebarListProps {
  parties: PartyState[]
  translateRole: (role: string) => string
  tFreeLabel: string
  tMultiWeapon: (n: number) => string
  tEmpty: string
  tUnassignedRole: string
  locale: Locale
}

function SidebarList({
  parties,
  translateRole,
  tFreeLabel,
  tMultiWeapon,
  tEmpty,
  tUnassignedRole,
  locale,
}: SidebarListProps) {
  const nonEmpty = parties.filter((p) => p.slots.length > 0)
  if (nonEmpty.length === 0) {
    return <p className="text-gray-500 text-sm text-center py-4">{tEmpty}</p>
  }
  return (
    <div>
      {nonEmpty.map((party, idx) => (
        <div key={party.party_number}>
          {idx > 0 && <hr className="border-gray-800 my-1.5" />}
          <ul className="space-y-0.5">
            {party.slots.map((slot, slotIdx) => (
              <SidebarRow
                key={slotIdx}
                slot={slot}
                partyNumber={party.party_number}
                slotNumber={slotIdx + 1}
                translateRole={translateRole}
                tFreeLabel={tFreeLabel}
                tMultiWeapon={tMultiWeapon}
                tUnassignedRole={tUnassignedRole}
                locale={locale}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

interface SidebarRowProps {
  slot: SlotInput
  partyNumber: number
  slotNumber: number
  translateRole: (role: string) => string
  tFreeLabel: string
  tMultiWeapon: (n: number) => string
  tUnassignedRole: string
  locale: Locale
}

function SidebarRow({
  slot,
  partyNumber,
  slotNumber,
  translateRole,
  tFreeLabel,
  tMultiWeapon,
  tUnassignedRole,
  locale,
}: SidebarRowProps) {
  const { getLocalizedItemName } = useItemNameResolver(locale)
  const roleStyle = getRoleStyle(slot.role_name)
  const primaryKind: SlotKey = getPrimaryGearKind(slot.role_name)
  const options = slot.options[primaryKind]
  const item = slot.items[primaryKind]
  const showMulti = options.length > 0
  const primaryFree = !showMulti && isFreeItem(item.name, item.id)
  const localizedName = item.id ? getLocalizedItemName(item.id, locale, item.name) : item.name
  const visibleName = stripTierPrefix(localizedName ?? item.name)

  return (
    <li className="flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-gray-800/60 transition-colors">
      <span className="text-gray-600 text-[12px] font-mono w-7 flex-shrink-0 text-right">
        {partyNumber}-{slotNumber}
      </span>

      <span
        className={`text-[12px] font-bold px-1.5 py-0.5 rounded w-16 text-center flex-shrink-0 truncate ${
          roleStyle
            ? roleStyle.badge
            : 'bg-gray-700/60 text-gray-300 border border-gray-600/40'
        }`}
      >
        {slot.role_name ? translateRole(slot.role_name) : tUnassignedRole}
      </span>

      <div className="flex items-center gap-1 flex-1 min-w-0">
        {showMulti ? (
          <div className="w-5 h-5 rounded-sm bg-amber-500/10 border border-amber-500/40 text-amber-300 flex items-center justify-center flex-shrink-0">
            <Swords size={10} />
          </div>
        ) : primaryFree ? (
          <div
            className="w-5 h-5 rounded-sm bg-emerald-900/40 border border-emerald-600/50 text-emerald-300 font-bold flex items-center justify-center text-[10px] flex-shrink-0 tracking-tighter"
            aria-label={tFreeLabel}
          >
            {tFreeLabel}
          </div>
        ) : item.id ? (
          <ItemImage itemId={item.id} itemName={stripTierPrefix(item.name)} size={23} hoverPreview />
        ) : (
          <div className="w-5 h-5 rounded-sm bg-gray-800 border border-gray-700 flex-shrink-0" />
        )}
        <span className="text-gray-300 text-[13px] truncate">
          {showMulti ? tMultiWeapon(options.length) : visibleName || '-'}
        </span>
      </div>
    </li>
  )
}
