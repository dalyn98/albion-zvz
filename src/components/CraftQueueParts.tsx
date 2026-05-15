'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Box, ChevronDown, MapPin, Settings2 } from 'lucide-react'
import {
  setMyCrafterDefaults,
  type CraftCompensationMode,
  type CraftQueueItem,
  type CrafterProfile,
} from '@/app/actions/craft'
import { releaseCraftQueueItem } from '@/app/actions/craft-queue'
import { SLOT_KEYS, type BuildSnapshot, type SlotKey } from '@/types'
import { formatSilver } from '@/lib/silver'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import {
  formatGatherTime,
  type EventGroup,
} from '@/lib/craft-grouping'
import {
  CITY_BADGE_STYLE,
  CRAFT_CITIES,
  getTaskCities,
  type CraftCity,
} from '@/lib/crafting-cities'
import ItemImage from './ItemImage'
import { useToast } from './ToastProvider'

interface EventGroupHeaderProps {
  group: EventGroup
  isCollapsed: boolean
  onToggleCollapse: () => void
  // 선택 토글이 의미 없는 그룹(deliveredGroups 등)에서는 모두 생략 가능.
  allChecked?: boolean
  onToggleAll?: () => void
  disabled?: boolean
}

export function EventGroupHeader({
  group,
  isCollapsed,
  onToggleCollapse,
  allChecked,
  onToggleAll,
  disabled,
}: EventGroupHeaderProps) {
  const t = useTranslations('craftQueue')
  const showSelectAll = onToggleAll != null
  const isNoEvent = !group.eventId
  const title = isNoEvent ? t('groupNoEvent') : group.eventTitle
  const gatherLabel = isNoEvent
    ? null
    : group.gatherAt
      ? t('groupGatherAt', { time: formatGatherTime(group.gatherAt) })
      : t('groupGatherAtUnset')
  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-gray-900/60 border border-gray-800 rounded-xl">
      <button
        type="button"
        onClick={onToggleCollapse}
        aria-label={isCollapsed ? t('groupExpand') : t('groupCollapse')}
        className="text-gray-500 hover:text-white flex-shrink-0"
      >
        <ChevronDown
          size={14}
          className={`transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
        />
      </button>
      {showSelectAll && (
        <input
          type="checkbox"
          checked={allChecked ?? false}
          onChange={onToggleAll}
          disabled={disabled}
          className="rounded border-gray-700 bg-gray-950 flex-shrink-0"
          aria-label={t('selectAllLabel')}
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-semibold truncate">{title}</p>
        <p className="text-[11px] text-gray-400 mt-0.5 flex flex-wrap gap-x-2">
          {gatherLabel && <span>{gatherLabel}</span>}
          <span className={gatherLabel ? 'text-gray-500' : ''}>
            {gatherLabel ? '· ' : ''}{t('groupCount', { count: group.items.length })}
          </span>
          {group.totalClaimedSilver > 0 && (
            <span className="text-amber-300 font-mono">
              · {t('groupSilverTotal', { silver: formatSilver(group.totalClaimedSilver) })}
            </span>
          )}
        </p>
        {isNoEvent && (
          <p className="text-[10px] text-amber-300/70 mt-0.5">{t('groupNoEventHint')}</p>
        )}
      </div>
    </div>
  )
}

interface TaskHeaderProps {
  item: CraftQueueItem
  tRole: ReturnType<typeof useTranslations>
}

export function TaskHeader({ item, tRole }: TaskHeaderProps) {
  const t = useTranslations('craftQueue')
  const cities = useMemo(() => getTaskCities(item.buildSnapshot), [item.buildSnapshot])
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-white text-sm font-semibold truncate">{item.eventTitle}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {t('requesterLine', { name: item.requesterUsername })}
            <span className="ml-2 text-gray-500">· {translateSlotRole(item.roleName, tRole)}</span>
            {item.claimedSilver != null && (
              <span className="ml-2 text-amber-300 font-mono">{formatSilver(item.claimedSilver)}</span>
            )}
          </p>
        </div>
      </div>
      {cities.size > 0 && <TaskCityBadges cities={cities} />}
    </div>
  )
}

function TaskCityBadges({ cities }: { cities: Set<CraftCity> }) {
  const t = useTranslations('craftQueue')
  // 표시 순서를 CRAFT_CITIES 의 정의 순으로 고정 → 카드 간 일관된 정렬.
  const ordered = CRAFT_CITIES.filter((c) => cities.has(c))
  return (
    <div className="flex flex-wrap items-center gap-1">
      <MapPin size={10} className="text-gray-500 mr-0.5 flex-shrink-0" />
      {ordered.map((city) => (
        <span
          key={city}
          className={`text-[10px] font-bold border rounded px-1.5 py-0.5 ${CITY_BADGE_STYLE[city]}`}
        >
          {t(`cityBonus.${city}`)}
        </span>
      ))}
    </div>
  )
}

interface CityFilterBarProps {
  selected: Set<CraftCity>
  onToggle: (city: CraftCity) => void
  onClear: () => void
  totalRaw: number
  totalFiltered: number
}

export function CityFilterBar({
  selected,
  onToggle,
  onClear,
  totalRaw,
  totalFiltered,
}: CityFilterBarProps) {
  const t = useTranslations('craftQueue')
  const isFiltering = selected.size > 0
  return (
    <section className="bg-gray-900 border border-gray-800 rounded-2xl p-3 sm:p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
          <MapPin size={12} className="text-amber-400" />
          {t('cityFilter.title')}
        </p>
        {isFiltering && (
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] text-gray-400 hover:text-white border border-gray-700 hover:border-amber-500/40 rounded-lg px-2 py-1"
          >
            {t('cityFilter.clear')}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {CRAFT_CITIES.map((city) => {
          const active = selected.has(city)
          return (
            <button
              key={city}
              type="button"
              onClick={() => onToggle(city)}
              className={`text-[11px] font-bold border rounded-lg px-2.5 py-1 transition ${
                active
                  ? CITY_BADGE_STYLE[city]
                  : 'border-gray-700 bg-gray-950 text-gray-400 hover:text-white hover:border-gray-500'
              }`}
            >
              {t(`cityBonus.${city}`)}
            </button>
          )
        })}
      </div>
      {isFiltering && (
        <p className="text-[10px] text-gray-500">
          {t('cityFilter.matchCount', { matched: totalFiltered, total: totalRaw })}
        </p>
      )}
    </section>
  )
}

interface BuildPreviewProps {
  snapshot: BuildSnapshot | null
  stockByItemId: Record<string, number>
}

export function BuildPreview({ snapshot, stockByItemId }: BuildPreviewProps) {
  const tGear = useTranslations('gear')
  const t = useTranslations('craftQueue')
  if (!snapshot) return null
  return (
    <div className="flex items-center gap-1.5 flex-wrap border-t border-gray-800 pt-2.5">
      {SLOT_KEYS.map((key: SlotKey) => {
        const item = snapshot[key]
        if (!item) return null
        // 재고 키 자체가 없으면 tracked 안 되는 부위 (가방 등) — 배지 미노출.
        // 0 이상이면 항상 표시 (색은 stock 0 이면 회색, > 0 이면 emerald).
        // item.id 가 null 인 경우 (자유 선택 슬롯) 도 배지 미노출.
        const stock = item.id ? stockByItemId[item.id] : undefined
        const tracked = stock != null
        const inStock = tracked && stock > 0
        return (
          <div key={key} className="flex flex-col items-center" title={tGear(key)}>
            <ItemImage itemId={item.id} itemName={item.name} size={36} hoverPreview />
            {tracked && (
              <span
                className={`text-[10px] font-mono mt-0.5 px-1 rounded leading-none py-0.5 ${
                  inStock
                    ? 'text-emerald-300 bg-emerald-500/10 border border-emerald-500/30'
                    : 'text-gray-500 bg-gray-950 border border-gray-800'
                }`}
                aria-label={t('stockBadgeAria', { count: stock })}
              >
                {t('stockBadge', { count: stock })}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

interface ClaimedActionsProps {
  item: CraftQueueItem
  onDeliver: () => void
  onAfter: () => void
}

export function ClaimedActions({ item, onDeliver, onAfter }: ClaimedActionsProps) {
  const t = useTranslations('craftQueue')
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  const handleRelease = () => {
    startTransition(async () => {
      const r = await releaseCraftQueueItem(item.taskId)
      if (r.error) {
        toast.error(r.error)
        return
      }
      toast.info(t('toastReleased'))
      onAfter()
    })
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Link
        href={`/craft/queue/${item.taskId}`}
        className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-amber-500/40 rounded-lg px-3 py-2"
      >
        {t('detailButton')}
      </Link>
      <button
        type="button"
        onClick={handleRelease}
        disabled={pending}
        className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-rose-500/40 rounded-lg px-3 py-2 disabled:opacity-50"
      >
        {pending ? t('releasing') : t('releaseButton')}
      </button>
      <button
        type="button"
        onClick={onDeliver}
        className="text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black rounded-lg px-3 py-2"
      >
        {t('deliverButton')}
      </button>
    </div>
  )
}

interface BulkActionBarProps {
  selectedCount: number
  totalCount: number
  onToggleAll: () => void
  onClear: () => void
  actionLabel: string
  onAction: () => void
  actionTone: 'amber' | 'rose'
  pending: boolean
  t: ReturnType<typeof useTranslations>
}

export function BulkActionBar({
  selectedCount,
  totalCount,
  onToggleAll,
  onClear,
  actionLabel,
  onAction,
  actionTone,
  pending,
  t,
}: BulkActionBarProps) {
  const allChecked = selectedCount > 0 && selectedCount === totalCount
  const actionClass =
    actionTone === 'amber'
      ? 'bg-amber-500 hover:bg-amber-400 text-black'
      : 'bg-rose-500 hover:bg-rose-400 text-white'
  return (
    <div className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
        <input
          type="checkbox"
          checked={allChecked}
          onChange={onToggleAll}
          disabled={pending || totalCount === 0}
          className="rounded border-gray-700 bg-gray-950"
          aria-label={t('selectAllLabel')}
        />
        {t('selectAllLabel')}
      </label>
      <span className="text-[11px] text-gray-500">
        {t('selectedCount', { count: selectedCount })}
      </span>
      <div className="ml-auto flex items-center gap-2">
        {selectedCount > 0 && (
          <button
            type="button"
            onClick={onClear}
            disabled={pending}
            className="text-[11px] text-gray-400 hover:text-white px-2 py-1 disabled:opacity-50"
          >
            {t('clearSelectionLabel')}
          </button>
        )}
        <button
          type="button"
          onClick={onAction}
          disabled={pending || selectedCount === 0}
          className={`text-xs font-bold rounded-lg px-3 py-1.5 disabled:opacity-50 ${actionClass}`}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  )
}

interface CrafterDefaultsCardProps {
  profile: CrafterProfile | null
  onUpdated: () => void
}

export function CrafterDefaultsCard({ profile, onUpdated }: CrafterDefaultsCardProps) {
  const t = useTranslations('craftQueue')
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<CraftCompensationMode>(profile?.compensationMode ?? 'volunteer')
  const [premiumPct, setPremiumPct] = useState(String(profile?.premiumPct ?? 0))
  const [pending, startTransition] = useTransition()

  if (!profile) return null

  const save = () => {
    const parsed = Number(premiumPct)
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0 || parsed > 200) {
      toast.error(t('premiumOutOfRange'))
      return
    }
    startTransition(async () => {
      const r = await setMyCrafterDefaults(mode, parsed)
      if (r.error) {
        toast.error(r.error)
        return
      }
      toast.success(t('toastDefaultsSaved'))
      setOpen(false)
      onUpdated()
    })
  }

  const hasRange = profile.boxRangeStart != null && profile.boxRangeEnd != null

  return (
    <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white flex items-center gap-2">
            <Settings2 size={14} className="text-amber-400" />
            {t('defaultsTitle')}
          </p>
          <p className="text-[11px] text-gray-500 mt-1">
            {t('defaultsCurrent', {
              mode: profile.compensationMode === 'paid' ? t('modePaid') : t('modeVolunteer'),
              premium: profile.premiumPct,
            })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-xs text-amber-300 hover:text-amber-200 border border-amber-500/30 rounded-lg px-2.5 py-1.5"
        >
          {open ? t('cancel') : t('edit')}
        </button>
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11px] text-gray-400">
        <Box size={12} className="text-emerald-400" />
        {hasRange ? (
          <span>
            {t('boxRangeAssigned', {
              start: profile.boxRangeStart!,
              end: profile.boxRangeEnd!,
            })}
          </span>
        ) : (
          <span className="text-amber-300/80">{t('boxRangeUnassigned')}</span>
        )}
      </div>
      {open && (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {(['volunteer', 'paid'] as const).map((m) => {
              const active = mode === m
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`text-left rounded-lg border px-3 py-2 ${
                    active
                      ? 'border-amber-400 bg-amber-500/10 text-amber-200'
                      : 'border-gray-700 bg-gray-950 text-gray-300 hover:border-gray-500'
                  }`}
                >
                  <p className="text-xs font-bold">
                    {m === 'paid' ? t('modePaid') : t('modeVolunteer')}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {m === 'paid' ? t('modePaidHint') : t('modeVolunteerHint')}
                  </p>
                </button>
              )
            })}
          </div>
          {mode === 'paid' && (
            <div>
              <label className="block text-[11px] text-gray-400 mb-1">{t('premiumLabel')}</label>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={200}
                value={premiumPct}
                onChange={(e) => setPremiumPct(e.target.value)}
                disabled={pending}
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
              />
              <p className="text-[10px] text-gray-500 mt-1">{t('premiumHint')}</p>
            </div>
          )}
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="w-full text-xs font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black rounded-lg px-3 py-2"
          >
            {pending ? t('saving') : t('save')}
          </button>
        </div>
      )}
    </section>
  )
}
