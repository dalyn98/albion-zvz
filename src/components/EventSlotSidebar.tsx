import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { PartyWithSlots } from '@/types'
import { getRoleStyle, isFreeItem, getDisplayGear, getPrimaryGearKind, hasGearOptions } from '@/types'
import { stripTierPrefix } from '@/lib/weapon-display'
import { getLocalizedItemName } from '@/lib/item-names'
import { getLocale } from '@/lib/locale'
import type { Locale } from '@/i18n/locales'
import { getMountDisarray } from '@/lib/battle-mounts'
import { summarizeEventArmorShare } from '@/lib/event-party-grid'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import { isAnonymousEventGuestId } from '@/lib/event-guest-identity'
import ItemImage from './ItemImage'
import MemberAvatar from './MemberAvatar'
import { ChevronDown, ChevronUp, Users, Shield, Zap, Swords } from 'lucide-react'

type Placement = 'mobile' | 'desktop'

interface Props {
  parties: PartyWithSlots[]
  placement: Placement
  title?: string
  avatars?: Record<string, string | null>
  memberHrefPrefix?: string
}

// Pre-resolved translation bundle we pass down through the sub-components.
// Keeps getTranslations() at the async root so inner components stay sync.
interface SidebarLabels {
  title: string
  disarray: string
  disarrayShort: (level: number) => string
  disarrayLevel: (level: number) => string
  disarrayNext: (level: number, players: number) => string
  disarrayPeople: (count: number) => string
  mountExcess: (excess: number) => string
  mountApplied: (raw: number, excess: number) => string
  mountPending: (raw: number, threshold: number) => string
  armorStatus: string
  expand: string
  collapse: string
  unassigned: string
  multiWeapon: (n: number) => string
  empty: string
  noSlots: string
  viewMember: (name: string) => string
  free: string
  armorLabel: (keywords: readonly string[]) => string
  roleLabel: (role: string) => string
}

// Icons are our best-guess T8 uniqueNames. Count-matching is by `keywords`, so if an
// iconId no longer renders you can swap it without affecting counts. `labelKey` is
// looked up under the `armor` message namespace at render time so the tracked
// list stays language-neutral here.
const TRACKED_ARMORS: ReadonlyArray<{
  labelKey: 'keeper' | 'hell' | 'knight' | 'fey' | 'guardian'
  keywords: readonly string[]
  iconId: string
}> = [
  { labelKey: 'keeper',   keywords: ['심판관', 'judicator', 'ジャッジメント'],      iconId: 'T8_ARMOR_PLATE_KEEPER' },
  { labelKey: 'hell',     keywords: ['데몬', '헬리온', 'demon', 'hellion', 'デーモン', 'ヘリオン'], iconId: 'T8_ARMOR_PLATE_HELL' },
  { labelKey: 'knight',   keywords: ['기사', 'knight', 'ナイト'],                   iconId: 'T8_ARMOR_PLATE_SET2' },
  { labelKey: 'fey',      keywords: ['더스크위버', 'duskweaver', 'ダスクウィーバー'], iconId: 'T8_ARMOR_PLATE_FEY' },
  { labelKey: 'guardian', keywords: ['가디언', 'guardian', 'ガーディアン'],         iconId: 'T8_ARMOR_PLATE_SET3' },
]

// Disarray Level N kicks in at DISARRAY_THRESHOLDS[N-1] players.
// Source: wiki.albiononline.com/wiki/Disarray (VERSION 22.090.1 column).
const DISARRAY_THRESHOLDS: readonly number[] = [
  21, 22, 23, 24, 25, 26, 27, 28, 29, 30,         // L1-L10
  31, 32, 33, 34, 36, 37, 39, 41, 43, 46,         // L11-L20
  48, 49, 51, 54, 56, 58, 61, 64, 67, 70,         // L21-L30
  74, 79, 83, 89, 95, 99, 103, 108, 114, 119,     // L31-L40
  126, 133, 141, 148, 154, 160, 167, 175, 183, 192, // L41-L50
  200, 207, 215, 223, 232, 242, 252, 264, 276, 290, // L51-L60
  305, 322, 341, 361, 385, 412,                    // L61-L66
]

function disarrayLevel(count: number): number {
  let level = 0
  for (let i = 0; i < DISARRAY_THRESHOLDS.length; i++) {
    if (count >= DISARRAY_THRESHOLDS[i]) level = i + 1
    else break
  }
  return level
}

function nextDisarray(level: number): { level: number; players: number } | null {
  if (level >= DISARRAY_THRESHOLDS.length) return null
  return { level: level + 1, players: DISARRAY_THRESHOLDS[level] }
}

function disarrayColor(level: number): string {
  if (level === 0) return 'text-gray-300'
  if (level <= 5) return 'text-amber-300'
  if (level <= 15) return 'text-orange-400'
  return 'text-red-400'
}

function countApplications(parties: PartyWithSlots[]): { assigned: number; total: number } {
  let total = 0
  let assigned = 0
  for (const p of parties) {
    for (const s of p.slots) {
      total++
      if (s.assigned_discord_id) assigned++
    }
  }
  return { assigned, total }
}

// Sum of per-mount disarray contributions across assigned slots only. A mount
// parked in an unfilled slot isn't in the field, so it shouldn't scale disarray.
function sumMountDisarray(parties: PartyWithSlots[]): number {
  let sum = 0
  for (const p of parties) {
    for (const s of p.slots) {
      if (!s.assigned_discord_id) continue
      // Battle mounts live in the mount column after migration 037. Still
      // fall back to weapon for disarray IDs in case a legacy slot hasn't
      // been migrated yet (role_name !== 'BM' but weapon holds a mount).
      const mount = getDisplayGear(s, 'mount')
      const weapon = getDisplayGear(s, 'weapon')
      sum += getMountDisarray(mount.id) + getMountDisarray(weapon.id)
    }
  }
  return sum
}

// Per the April 2026 patch: a group's cumulative Battle Mount Disarray only
// contributes once it exceeds 15 points, and only the excess is added to the
// alliance's effective headcount for disarray scaling.
const MOUNT_DISARRAY_THRESHOLD = 15

function mountDisarrayExcess(raw: number): number {
  return Math.max(0, raw - MOUNT_DISARRAY_THRESHOLD)
}

export default async function EventSlotSidebar({
  parties,
  placement,
  title,
  avatars = {},
  memberHrefPrefix = '/members',
}: Props) {
  const [t, tArmor, tSlot, tRole, locale] = await Promise.all([
    getTranslations('eventSidebar'),
    getTranslations('armor'),
    getTranslations('slot'),
    getTranslations('slotRole'),
    getLocale(),
  ])
  const { assigned, total } = countApplications(parties)
  const mountRaw = sumMountDisarray(parties)
  const labels: SidebarLabels = {
    title: title ?? t('title'),
    disarray: t('disarray'),
    disarrayShort: (level) => t('disarrayShort', { level }),
    disarrayLevel: (level) => t('disarrayLevel', { level }),
    disarrayNext: (level, players) => t('disarrayNext', { level, players }),
    disarrayPeople: (count) => t('disarrayPeople', { count }),
    mountExcess: (excess) => t('mountExcess', { excess }),
    mountApplied: (raw, excess) => t('mountApplied', { raw, excess }),
    mountPending: (raw, threshold) => t('mountPending', { raw, threshold }),
    armorStatus: t('armorStatus'),
    expand: t('expand'),
    collapse: t('collapse'),
    unassigned: t('unassigned'),
    multiWeapon: (n) => t('multiWeapon', { n }),
    empty: t('empty'),
    noSlots: t('noSlots'),
    viewMember: (name) => t('viewMember', { name }),
    free: tSlot('free'),
    armorLabel: (keywords) => {
      const entry = TRACKED_ARMORS.find((a) => a.keywords === keywords)
      return entry ? tArmor(entry.labelKey) : ''
    },
    roleLabel: (role) => translateSlotRole(role, tRole),
  }

  if (placement === 'mobile') {
    return (
      <MobileCollapsedSidebar
        parties={parties}
        assigned={assigned}
        total={total}
        mountRaw={mountRaw}
        avatars={avatars}
        labels={labels}
        locale={locale}
        memberHrefPrefix={memberHrefPrefix}
      />
    )
  }

  return (
    <DesktopSidebar
      parties={parties}
      assigned={assigned}
      total={total}
      avatars={avatars}
      mountRaw={mountRaw}
      labels={labels}
      locale={locale}
      memberHrefPrefix={memberHrefPrefix}
    />
  )
}

function MobileCollapsedSidebar({
  parties,
  assigned,
  total,
  mountRaw,
  avatars,
  labels,
  locale,
  memberHrefPrefix,
}: {
  parties: PartyWithSlots[]
  assigned: number
  total: number
  mountRaw: number
  avatars: Record<string, string | null>
  labels: SidebarLabels
  locale: Locale
  memberHrefPrefix: string
}) {
  // Mobile: collapse disarray + armor + slot list into one <details> to reclaim
  // vertical space. Summary row carries the two most-actionable numbers (혼란
  // level + 신청 count) so users can skim without expanding.
  const excess = mountDisarrayExcess(mountRaw)
  const effective = assigned + excess
  const level = disarrayLevel(effective)
  return (
    <details className="group bg-gray-900 border border-gray-800 rounded-xl">
      <summary className="w-full flex items-center justify-between gap-3 px-3 py-2.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-1 flex-shrink-0">
            <Zap size={12} className="text-red-400" />
            <span className={`text-sm font-bold tabular-nums ${disarrayColor(level)}`}>
              {labels.disarrayShort(level)}
            </span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Users size={12} className="text-amber-400" />
            <span className="text-white text-sm font-bold tabular-nums">{assigned}/{total}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 text-gray-500 text-[12px] flex-shrink-0">
          <span className="group-open:hidden">{labels.expand}</span>
          <span className="hidden group-open:inline">{labels.collapse}</span>
          <ChevronDown size={14} className="text-gray-400 group-open:hidden" />
          <ChevronUp size={14} className="text-gray-400 hidden group-open:block" />
        </div>
      </summary>
      <div className="border-t border-gray-800 divide-y divide-gray-800">
        <DisarraySection assigned={assigned} mountRaw={mountRaw} labels={labels} />
        <ArmorSummarySection parties={parties} labels={labels} />
        <div className="max-h-[50vh] overflow-y-auto p-2">
          <SidebarList
            parties={parties}
            avatars={avatars}
            labels={labels}
            locale={locale}
            memberHrefPrefix={memberHrefPrefix}
          />
        </div>
      </div>
    </details>
  )
}

function DisarraySection({
  assigned,
  mountRaw,
  labels,
}: {
  assigned: number
  mountRaw: number
  labels: SidebarLabels
}) {
  const excess = mountDisarrayExcess(mountRaw)
  const effective = assigned + excess
  const level = disarrayLevel(effective)
  const next = nextDisarray(level)
  const mountActive = excess > 0
  return (
    <div className="p-2.5 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Zap size={13} className="text-red-400" />
        <span className="text-gray-400 text-[13px] font-bold uppercase tracking-wide">{labels.disarray}</span>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className={`text-xl font-bold leading-none tabular-nums ${disarrayColor(level)}`}>
            {labels.disarrayLevel(level)}
          </span>
          <span className="text-gray-400 text-sm tabular-nums">
            {labels.disarrayPeople(assigned)}
            {mountActive && <span className="text-amber-300"> {labels.mountExcess(excess)}</span>}
          </span>
        </div>
        {next && (
          <span className="text-gray-500 text-[12px] tabular-nums">
            {labels.disarrayNext(next.level, next.players - effective)}
          </span>
        )}
      </div>
      {mountRaw > 0 && (
        <p className="text-[12px] tabular-nums leading-tight">
          {mountActive ? (
            <span className="text-amber-300/90">{labels.mountApplied(mountRaw, excess)}</span>
          ) : (
            <span className="text-gray-500">{labels.mountPending(mountRaw, MOUNT_DISARRAY_THRESHOLD)}</span>
          )}
        </p>
      )}
    </div>
  )
}

function ArmorSummarySection({
  parties,
  labels,
}: {
  parties: PartyWithSlots[]
  labels: SidebarLabels
}) {
  return (
    <div className="p-2.5 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Shield size={13} className="text-amber-400" />
        <span className="text-gray-400 text-[13px] font-bold uppercase tracking-wide">{labels.armorStatus}</span>
      </div>
      <div className="space-y-1">
        {TRACKED_ARMORS.map(({ labelKey, keywords, iconId }) => {
          const { count, total } = summarizeEventArmorShare(parties, keywords)
          const label = labels.armorLabel(keywords)
          return (
            <div key={labelKey} className="flex items-center gap-2">
              <ItemImage itemId={iconId} itemName={label} size={25} />
              <span className="text-gray-300 text-[13px] flex-1 truncate">{label}</span>
              <span
                className={`text-sm font-bold tabular-nums ${
                  count > 0 ? 'text-amber-400' : 'text-gray-600'
                }`}
              >
                {count}/{total}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DesktopSidebar({
  parties,
  assigned,
  total,
  avatars,
  mountRaw,
  labels,
  locale,
  memberHrefPrefix,
}: {
  parties: PartyWithSlots[]
  assigned: number
  total: number
  avatars: Record<string, string | null>
  mountRaw: number
  labels: SidebarLabels
  locale: Locale
  memberHrefPrefix: string
}) {
  return (
    <div className="sticky top-4 flex flex-col max-h-[calc(100vh-2rem)] bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Users size={14} className="text-amber-400" />
          <span className="text-white text-sm font-bold">{labels.title}</span>
        </div>
        <span className="text-gray-400 text-sm">
          {assigned}/{total}
        </span>
      </div>
      <div className="flex-shrink-0">
        <DisarraySection assigned={assigned} mountRaw={mountRaw} labels={labels} />
      </div>
      <div className="flex-shrink-0">
        <ArmorSummarySection parties={parties} labels={labels} />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-2">
        <SidebarList
          parties={parties}
          avatars={avatars}
          labels={labels}
          locale={locale}
          memberHrefPrefix={memberHrefPrefix}
        />
      </div>
    </div>
  )
}

function SidebarList({
  parties,
  avatars,
  labels,
  locale,
  memberHrefPrefix,
}: {
  parties: PartyWithSlots[]
  avatars: Record<string, string | null>
  labels: SidebarLabels
  locale: Locale
  memberHrefPrefix: string
}) {
  const nonEmpty = parties.filter((p) => p.slots.length > 0)
  if (nonEmpty.length === 0) {
    return <p className="text-gray-500 text-sm text-center py-4">{labels.noSlots}</p>
  }

  return (
    <div>
      {nonEmpty.map((party, idx) => (
        <div key={party.id}>
          {idx > 0 && <hr className="border-gray-800 my-1.5" />}
          <ul className="space-y-0.5">
            {party.slots.map((slot) => (
              <SidebarRow
                key={slot.id}
                slot={slot}
                partyNumber={party.party_number}
                avatar={slot.assigned_discord_id ? avatars[slot.assigned_discord_id] ?? null : null}
                labels={labels}
                locale={locale}
                memberHrefPrefix={memberHrefPrefix}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function SidebarRow({
  slot,
  partyNumber,
  avatar,
  labels,
  locale,
  memberHrefPrefix,
}: {
  slot: PartyWithSlots['slots'][number]
  partyNumber: number
  avatar: string | null
  labels: SidebarLabels
  locale: Locale
  memberHrefPrefix: string
}) {
  const roleStyle = getRoleStyle(slot.role_name)
  const primaryKind = getPrimaryGearKind(slot.role_name)
  const primaryOptions = primaryKind === 'mount' ? slot.mount_options : slot.weapon_options
  const isMulti = hasGearOptions(slot, primaryKind)
  const isAssigned = slot.assigned_discord_id !== null
  // When slot has options on the primary kind and no one has claimed it yet,
  // show a multi marker — the picked item only exists post-assign.
  const showMulti = isMulti && !isAssigned
  const display = getDisplayGear(slot, primaryKind)
  const primaryFree = !showMulti && isFreeItem(display.name, display.id)
  return (
    <li className="flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-gray-800/60 transition-colors">
      <span className="text-gray-600 text-[12px] font-mono w-7 flex-shrink-0 text-right">
        {partyNumber}-{slot.slot_number}
      </span>

      <span
        className={`text-[12px] font-bold px-1.5 py-0.5 rounded w-16 text-center flex-shrink-0 truncate ${
          roleStyle
            ? roleStyle.badge
            : 'bg-gray-700/60 text-gray-300 border border-gray-600/40'
        }`}
      >
        {slot.role_name ? labels.roleLabel(slot.role_name) : labels.unassigned}
      </span>

      <div className="flex items-center gap-1 flex-1 min-w-0">
        {showMulti ? (
          <div className="w-5 h-5 rounded-sm bg-amber-500/10 border border-amber-500/40 text-amber-300 flex items-center justify-center flex-shrink-0">
            <Swords size={10} />
          </div>
        ) : primaryFree ? (
          <div
            className="w-5 h-5 rounded-sm bg-emerald-900/40 border border-emerald-600/50 text-emerald-300 font-bold flex items-center justify-center text-[10px] flex-shrink-0 tracking-tighter"
            aria-label={labels.free}
          >
            {labels.free}
          </div>
        ) : (
          <ItemImage itemId={display.id} itemName={stripTierPrefix(display.name)} size={23} hoverPreview />
        )}
        <span className="text-gray-300 text-[13px] truncate">
          {showMulti
            ? labels.multiWeapon(primaryOptions!.length)
            : stripTierPrefix(getLocalizedItemName(display.id, locale, display.name) ?? display.name) || '-'}
        </span>
      </div>

      {slot.assigned_username && slot.assigned_discord_id ? (
        isAnonymousEventGuestId(slot.assigned_discord_id) ? (
          <div className="flex items-center gap-1 flex-shrink-0 max-w-[90px] text-right text-green-400">
            <MemberAvatar discordId={slot.assigned_discord_id} avatar={avatar} size={14} />
            <span className="text-[13px] font-medium truncate">{slot.assigned_username}</span>
          </div>
        ) : (
        <Link
          href={`${memberHrefPrefix}/${slot.assigned_discord_id}`}
          className="flex items-center gap-1 flex-shrink-0 max-w-[90px] text-right text-green-400 hover:text-green-300 hover:underline underline-offset-2"
          title={labels.viewMember(slot.assigned_username)}
        >
          <MemberAvatar discordId={slot.assigned_discord_id} avatar={avatar} size={14} />
          <span className="text-[13px] font-medium truncate">{slot.assigned_username}</span>
        </Link>
        )
      ) : (
        <div className="flex items-center gap-1 flex-shrink-0 max-w-[90px] text-right text-gray-600">
          <span className="text-[13px] font-medium truncate">{labels.empty}</span>
        </div>
      )}
    </li>
  )
}
