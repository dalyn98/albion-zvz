'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Box, Hammer, X, RefreshCw, Coins, Settings2 } from 'lucide-react'
import {
  claimCraftQueueItem,
  releaseCraftQueueItem,
  deliverCraftQueueItem,
  previewCraftMaterialCost,
  setMyCrafterDefaults,
  type CraftQueueItem,
  type CraftBoxConfig,
  type CrafterProfile,
  type CraftCompensationMode,
} from '@/app/actions/craft'
import type { BuildCostBreakdown } from '@/lib/craft-recipes'
import { SLOT_KEYS, type BuildSnapshot, type SlotKey } from '@/types'
import { formatSilver } from '@/lib/silver'
import ItemImage from './ItemImage'
import { useToast } from './ToastProvider'
import { translateSlotRole } from '@/lib/slot-role-i18n'

interface LocationPreset {
  id: string
  i18nKey: string
  defaultReturnRatePct: number
}

interface Props {
  queued: CraftQueueItem[]
  mine: CraftQueueItem[]
  profile: CrafterProfile | null
  config: CraftBoxConfig
  locations: LocationPreset[]
}

export default function CraftQueueClient({ queued, mine, profile, config, locations }: Props) {
  const t = useTranslations('craftQueue')
  const tRole = useTranslations('slotRole')
  const router = useRouter()
  const toast = useToast()

  const [claimTarget, setClaimTarget] = useState<CraftQueueItem | null>(null)
  const [deliverTarget, setDeliverTarget] = useState<CraftQueueItem | null>(null)

  const claimedTasks = useMemo(() => mine.filter((m) => m.status === 'claimed'), [mine])
  const deliveredTasks = useMemo(() => mine.filter((m) => m.status === 'delivered'), [mine])

  return (
    <div className="space-y-6">
      <CrafterDefaultsCard
        profile={profile}
        onUpdated={() => router.refresh()}
      />

      <section className="space-y-3">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Hammer size={16} className="text-amber-400" />
          {t('queueTitle')}
          <span className="text-xs text-gray-500">({queued.length})</span>
        </h2>
        {queued.length === 0 ? (
          <p className="text-gray-500 text-sm bg-gray-900 border border-gray-800 rounded-2xl px-4 py-6 text-center">
            {t('queueEmpty')}
          </p>
        ) : (
          <ul className="space-y-3">
            {queued.map((item) => (
              <li
                key={item.taskId}
                className="bg-gray-900 border border-gray-700 rounded-2xl p-4 space-y-3"
              >
                <TaskHeader item={item} tRole={tRole} />
                <BuildPreview snapshot={item.buildSnapshot} />
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => setClaimTarget(item)}
                    className="text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black rounded-lg px-3 py-2"
                  >
                    {t('claimButton')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Box size={16} className="text-emerald-400" />
          {t('mineTitle')}
          <span className="text-xs text-gray-500">({mine.length})</span>
        </h2>
        {mine.length === 0 ? (
          <p className="text-gray-500 text-sm bg-gray-900 border border-gray-800 rounded-2xl px-4 py-6 text-center">
            {t('mineEmpty')}
          </p>
        ) : (
          <ul className="space-y-3">
            {claimedTasks.map((item) => (
              <li
                key={item.taskId}
                className="bg-gray-900 border border-amber-500/30 rounded-2xl p-4 space-y-3"
              >
                <TaskHeader item={item} tRole={tRole} />
                <BuildPreview snapshot={item.buildSnapshot} />
                <ClaimedActions
                  item={item}
                  onDeliver={() => setDeliverTarget(item)}
                  onAfter={() => router.refresh()}
                />
              </li>
            ))}
            {deliveredTasks.map((item) => (
              <li
                key={item.taskId}
                className="bg-gray-900 border border-emerald-500/30 rounded-2xl p-4 space-y-3"
              >
                <TaskHeader item={item} tRole={tRole} />
                <BuildPreview snapshot={item.buildSnapshot} />
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-400">
                  <span className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 rounded px-2 py-0.5 font-mono">
                    {t('boxLabel', { n: item.boxNumber ?? 0 })}
                  </span>
                  {item.craftCity && <span className="text-gray-500">· {item.craftCity}</span>}
                  {item.materialSilverCost != null && (
                    <span className="text-gray-500">
                      · {t('materialSpent', { silver: formatSilver(item.materialSilverCost) })}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {claimTarget && (
        <ClaimDialog
          item={claimTarget}
          defaultMode={profile?.compensationMode ?? 'volunteer'}
          defaultPremiumPct={profile?.premiumPct ?? 0}
          onClose={() => setClaimTarget(null)}
          onSuccess={() => {
            setClaimTarget(null)
            toast.success(t('toastClaimed'))
            router.refresh()
          }}
        />
      )}

      {deliverTarget && (
        <DeliverDialog
          item={deliverTarget}
          config={config}
          locations={locations}
          onClose={() => setDeliverTarget(null)}
          onSuccess={() => {
            setDeliverTarget(null)
            toast.success(t('toastDelivered'))
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

interface TaskHeaderProps {
  item: CraftQueueItem
  tRole: ReturnType<typeof useTranslations>
}

function TaskHeader({ item, tRole }: TaskHeaderProps) {
  const t = useTranslations('craftQueue')
  return (
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
  )
}

function BuildPreview({ snapshot }: { snapshot: BuildSnapshot | null }) {
  const tGear = useTranslations('gear')
  if (!snapshot) return null
  return (
    <div className="flex items-center gap-1.5 flex-wrap border-t border-gray-800 pt-2.5">
      {SLOT_KEYS.map((key: SlotKey) => {
        const item = snapshot[key]
        if (!item) return null
        return (
          <div key={key} className="flex flex-col items-center" title={tGear(key)}>
            <ItemImage itemId={item.id} itemName={item.name} size={36} hoverPreview />
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

function ClaimedActions({ item, onDeliver, onAfter }: ClaimedActionsProps) {
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

interface CrafterDefaultsCardProps {
  profile: CrafterProfile | null
  onUpdated: () => void
}

function CrafterDefaultsCard({ profile, onUpdated }: CrafterDefaultsCardProps) {
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

interface ClaimDialogProps {
  item: CraftQueueItem
  defaultMode: CraftCompensationMode
  defaultPremiumPct: number
  onClose: () => void
  onSuccess: () => void
}

function ClaimDialog({ item, defaultMode, defaultPremiumPct, onClose, onSuccess }: ClaimDialogProps) {
  const t = useTranslations('craftQueue')
  const toast = useToast()
  const [mode, setMode] = useState<CraftCompensationMode>(defaultMode)
  const [premiumPct, setPremiumPct] = useState(String(defaultPremiumPct))
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, pending])

  const submit = () => {
    const parsed = Number(premiumPct)
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0 || parsed > 200) {
      toast.error(t('premiumOutOfRange'))
      return
    }
    startTransition(async () => {
      const r = await claimCraftQueueItem({
        taskId: item.taskId,
        compensationMode: mode,
        premiumPct: parsed,
      })
      if (r.error) {
        toast.error(r.error)
        return
      }
      onSuccess()
    })
  }

  return (
    <ModalShell onClose={() => !pending && onClose()} title={t('claimDialogTitle')}>
      <p className="text-[11px] text-gray-400">{t('claimDialogHint')}</p>
      <div className="grid grid-cols-2 gap-2">
        {(['volunteer', 'paid'] as const).map((m) => {
          const active = mode === m
          return (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              disabled={pending}
              className={`text-left rounded-lg border px-3 py-2 ${
                active
                  ? 'border-amber-400 bg-amber-500/10 text-amber-200'
                  : 'border-gray-700 bg-gray-950 text-gray-300 hover:border-gray-500'
              } disabled:opacity-50`}
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
        </div>
      )}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={() => !pending && onClose()}
          disabled={pending}
          className="text-xs text-gray-400 hover:text-white px-3 py-2"
        >
          {t('cancel')}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="text-xs font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black rounded-lg px-4 py-2"
        >
          {pending ? t('claiming') : t('confirmClaim')}
        </button>
      </div>
    </ModalShell>
  )
}

interface DeliverDialogProps {
  item: CraftQueueItem
  config: CraftBoxConfig
  locations: LocationPreset[]
  onClose: () => void
  onSuccess: () => void
}

function DeliverDialog({ item, config, locations, onClose, onSuccess }: DeliverDialogProps) {
  const t = useTranslations('craftQueue')
  const toast = useToast()
  const [boxNumber, setBoxNumber] = useState('')
  const [locationId, setLocationId] = useState(locations[0]?.id ?? 'royal_city')
  const [customReturnPct, setCustomReturnPct] = useState('15')
  const [focusUsed, setFocusUsed] = useState(false)
  const [breakdown, setBreakdown] = useState<BuildCostBreakdown | null>(null)
  const [materialOverride, setMaterialOverride] = useState<string>('')
  const [previewing, startPreview] = useTransition()
  const [submitting, startSubmit] = useTransition()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !previewing && !submitting) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, previewing, submitting])

  const isCustom = locationId === 'custom'
  const selectedLocation = locations.find((l) => l.id === locationId)
  const locationLabel = useLocationLabel(locationId)
  const returnPct = isCustom ? Number(customReturnPct) : selectedLocation?.defaultReturnRatePct ?? 0

  const previewCost = () => {
    if (!Number.isFinite(returnPct) || returnPct < 0 || returnPct > 100) {
      toast.error(t('returnPctOutOfRange'))
      return
    }
    startPreview(async () => {
      const r = await previewCraftMaterialCost({
        taskId: item.taskId,
        locationReturnPct: returnPct,
        focusUsed,
      })
      if (r.error) {
        toast.error(r.error)
        return
      }
      setBreakdown(r.breakdown)
      if (r.breakdown) setMaterialOverride(String(r.breakdown.totalNetSilver))
    })
  }

  const submit = () => {
    const box = Number(boxNumber)
    if (!Number.isFinite(box) || !Number.isInteger(box) || box < 1) {
      toast.error(t('boxInvalid'))
      return
    }
    if (box < config.rangeMin || box > config.rangeMax) {
      toast.error(t('boxOutOfRange', { min: config.rangeMin, max: config.rangeMax }))
      return
    }
    const material = Number(materialOverride)
    if (!Number.isFinite(material) || !Number.isInteger(material) || material < 0) {
      toast.error(t('materialInvalid'))
      return
    }
    startSubmit(async () => {
      const r = await deliverCraftQueueItem({
        taskId: item.taskId,
        boxNumber: box,
        craftCity: locationLabel,
        craftFocusUsed: focusUsed,
        materialSilverCost: material,
      })
      if (r.error) {
        toast.error(r.error)
        return
      }
      onSuccess()
    })
  }

  const pending = previewing || submitting
  return (
    <ModalShell onClose={() => !pending && onClose()} title={t('deliverDialogTitle')}>
      <p className="text-[11px] text-gray-400">{t('deliverDialogHint')}</p>

      <div>
        <label className="block text-[11px] text-gray-400 mb-1">
          {t('boxLabelInput', { min: config.rangeMin, max: config.rangeMax })}
        </label>
        <input
          type="number"
          inputMode="numeric"
          min={config.rangeMin}
          max={config.rangeMax}
          value={boxNumber}
          onChange={(e) => setBoxNumber(e.target.value)}
          disabled={pending}
          placeholder={t('boxPlaceholder')}
          className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
        />
      </div>

      <div>
        <label className="block text-[11px] text-gray-400 mb-1">{t('locationLabel')}</label>
        <select
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          disabled={pending}
          className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
        >
          {locations.map((loc) => (
            <LocationOption key={loc.id} loc={loc} />
          ))}
        </select>
        {isCustom && (
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step={0.1}
            value={customReturnPct}
            onChange={(e) => setCustomReturnPct(e.target.value)}
            disabled={pending}
            placeholder={t('customReturnPctPlaceholder')}
            className="mt-2 w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
          />
        )}
      </div>

      <label className="flex items-center gap-2 text-xs text-gray-300">
        <input
          type="checkbox"
          checked={focusUsed}
          onChange={(e) => setFocusUsed(e.target.checked)}
          disabled={pending}
          className="rounded border-gray-700 bg-gray-950"
        />
        {t('focusUsedLabel', { bonus: config.focusBonusPct })}
      </label>

      <button
        type="button"
        onClick={previewCost}
        disabled={pending}
        className="w-full text-xs text-amber-300 hover:text-amber-200 border border-amber-500/30 rounded-lg px-3 py-2 flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <RefreshCw size={12} />
        {previewing ? t('previewing') : t('previewMaterialCost')}
      </button>

      {breakdown && (
        <div className="space-y-2 bg-gray-950 border border-gray-800 rounded-lg p-3">
          {breakdown.hasArtifact && (
            <p className="text-amber-300 text-[11px]">{t('artifactWarning')}</p>
          )}
          {breakdown.hasMissingPrice && (
            <p className="text-amber-300 text-[11px]">{t('missingPriceWarning')}</p>
          )}
          <div className="flex items-center justify-between text-[11px] text-gray-400">
            <span>{t('previewEffectiveReturn')}</span>
            <span className="font-mono text-gray-300">{breakdown.effectiveReturnPct.toFixed(1)}%</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-gray-400">
            <span>{t('previewGross')}</span>
            <span className="font-mono text-gray-300">{formatSilver(breakdown.totalGrossSilver)}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-amber-300 font-semibold flex items-center gap-1">
              <Coins size={12} />
              {t('previewNet')}
            </span>
            <span className="font-mono text-amber-300 font-bold">
              {formatSilver(breakdown.totalNetSilver)}
            </span>
          </div>
        </div>
      )}

      <div>
        <label className="block text-[11px] text-gray-400 mb-1">{t('materialLabel')}</label>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={materialOverride}
          onChange={(e) => setMaterialOverride(e.target.value)}
          disabled={pending}
          placeholder={t('materialPlaceholder')}
          className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
        />
        <p className="text-[10px] text-gray-500 mt-1">{t('materialHint')}</p>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={() => !pending && onClose()}
          disabled={pending}
          className="text-xs text-gray-400 hover:text-white px-3 py-2"
        >
          {t('cancel')}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="text-xs font-bold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black rounded-lg px-4 py-2"
        >
          {submitting ? t('delivering') : t('confirmDeliver')}
        </button>
      </div>
    </ModalShell>
  )
}

function LocationOption({ loc }: { loc: LocationPreset }) {
  const t = useTranslations('craftLocation')
  return (
    <option value={loc.id}>
      {t(loc.i18nKey)} ({loc.defaultReturnRatePct}%)
    </option>
  )
}

function useLocationLabel(locationId: string): string {
  const t = useTranslations('craftLocation')
  const presetMap: Record<string, string> = {
    royal_city: 'royalCity',
    caerleon: 'caerleon',
    hideout_t5: 'hideoutT5',
    hideout_t8: 'hideoutT8',
    custom: 'custom',
  }
  const k = presetMap[locationId] ?? 'custom'
  return t(k)
}

interface ModalShellProps {
  onClose: () => void
  title: string
  children: React.ReactNode
}

function ModalShell({ onClose, title, children }: ModalShellProps) {
  // body scroll lock while open.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        className="bg-gray-900 border border-gray-700 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[92dvh] flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h3 className="font-bold text-white text-base">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white"
            aria-label="close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 text-sm">{children}</div>
      </div>
    </div>
  )
}
