'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Clipboard, Plus, Trash2, Upload } from 'lucide-react'
import { formatSilver, parseSilverInput } from '@/lib/silver'
import {
  calcPayoutSilver,
  resolveRegearPreviewPayoutRatePercent,
} from '@/lib/regear-payout'
import { compressImageIfLarge } from '@/lib/image-compress'

export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp']

export type RequestType = 'death' | 'overcharge'

export interface EntryState {
  id: string
  requestType: RequestType
  file: File | null
  file2: File | null
  claimedInput: string
}

interface RequestTypePickerProps {
  onPick: (type: RequestType) => void
  deathDisabled?: boolean
}

export function RequestTypePicker({ onPick, deathDisabled = false }: RequestTypePickerProps) {
  const t = useTranslations('regear')
  return (
    <div className="space-y-3">
      <div>
        <p className="text-white text-base font-semibold">{t('typeChooseTitle')}</p>
        <p className="text-gray-400 text-[11px] mt-1 leading-relaxed">{t('typeChooseHint')}</p>
      </div>
      <div className="space-y-2">
        <button
          type="button"
          disabled={deathDisabled}
          onClick={() => onPick('death')}
          className={`w-full text-left rounded-lg border px-4 py-3 transition-colors ${
            deathDisabled
              ? 'border-gray-700 bg-gray-800/60 opacity-60 cursor-not-allowed'
              : 'border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20'
          }`}
        >
          <div
            className={
              deathDisabled
                ? 'text-gray-300 font-bold text-sm'
                : 'text-rose-200 font-bold text-sm'
            }
          >
            {t('typeDeathLabel')}
          </div>
          <div
            className={
              deathDisabled
                ? 'text-gray-500 text-[11px] mt-0.5'
                : 'text-rose-300/70 text-[11px] mt-0.5'
            }
          >
            {deathDisabled ? t('typeDeathLimitReachedHint') : t('typeDeathHint')}
          </div>
        </button>
        <button
          type="button"
          onClick={() => onPick('overcharge')}
          className="w-full text-left rounded-lg border border-orange-500/40 bg-orange-500/10 hover:bg-orange-500/20 px-4 py-3 transition-colors"
        >
          <div className="text-orange-200 font-bold text-sm">{t('typeOverchargeLabel')}</div>
          <div className="text-orange-300/70 text-[11px] mt-0.5">{t('typeOverchargeHint')}</div>
        </button>
      </div>
    </div>
  )
}

interface DeathCountPickerProps {
  maxEntries: number
  onPick: (count: number) => void
}

export function DeathCountPicker({ maxEntries, onPick }: DeathCountPickerProps) {
  const t = useTranslations('regear')
  const options = Array.from({ length: maxEntries }, (_, i) => i + 1)
  return (
    <div className="space-y-3">
      <div>
        <p className="text-white text-base font-semibold">{t('deathCountQuestion')}</p>
        <p className="text-gray-400 text-[11px] mt-1 leading-relaxed">
          {t('deathCountDescription')}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {options.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onPick(n)}
            className="flex flex-col items-center justify-center rounded-lg border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-200 font-bold py-4 transition-colors"
          >
            <span className="text-2xl">{n}</span>
            <span className="text-[10px] font-medium text-rose-300/80 mt-0.5">
              {t('deathCountOption', { n })}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

interface ManualRegearEntryActionsProps {
  canAddDeath: boolean
  canAddOvercharge: boolean
  overchargeEnabled: boolean
  onAddDeath: () => void
  onAddOvercharge: () => void
}

export function ManualRegearEntryActions({
  canAddDeath,
  canAddOvercharge,
  overchargeEnabled,
  onAddDeath,
  onAddOvercharge,
}: ManualRegearEntryActionsProps) {
  const t = useTranslations('regear')
  if (!canAddDeath && (!overchargeEnabled || !canAddOvercharge)) return null
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <button
        type="button"
        onClick={onAddDeath}
        disabled={!canAddDeath}
        className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-200 transition-colors hover:bg-rose-500/20 active:scale-[0.96] disabled:cursor-not-allowed disabled:border-gray-700 disabled:bg-gray-800/60 disabled:text-gray-500"
      >
        <Plus size={13} />
        {t('addDeathEntry')}
      </button>
      {overchargeEnabled && (
        <button
          type="button"
          onClick={onAddOvercharge}
          disabled={!canAddOvercharge}
          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-xs font-bold text-orange-200 transition-colors hover:bg-orange-500/20 active:scale-[0.96] disabled:cursor-not-allowed disabled:border-gray-700 disabled:bg-gray-800/60 disabled:text-gray-500"
        >
          <Plus size={13} />
          {t('addOverchargeEntry')}
        </button>
      )}
    </div>
  )
}

interface VideoProofFieldProps {
  id: string
  value: string
  onChange: (value: string) => void
  videoPayoutRatePercent: number
  videoRateAppliesWithoutProof?: boolean
  error?: string
  disabled?: boolean
}

export function VideoProofField({
  id,
  value,
  onChange,
  videoPayoutRatePercent,
  videoRateAppliesWithoutProof = false,
  error = '',
  disabled = false,
}: VideoProofFieldProps) {
  const t = useTranslations('regear')
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800/60 p-3">
      <label htmlFor={id} className="text-gray-300 text-[11px] font-semibold block mb-1">
        {t('videoProofLabel')}
      </label>
      <input
        id={id}
        type="url"
        inputMode="url"
        placeholder={t('videoProofPlaceholder')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-describedby={error ? `${hintId} ${errorId}` : hintId}
        aria-invalid={error ? true : undefined}
        className={`w-full bg-gray-950 border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none disabled:opacity-50 ${
          error ? 'border-red-500 focus:border-red-400' : 'border-gray-700 focus:border-amber-500'
        }`}
      />
      <p id={hintId} className="text-gray-500 text-[11px] mt-1 leading-relaxed">
        {t(videoRateAppliesWithoutProof ? 'videoProofBonusOnlyHint' : 'videoProofHint', {
          rate: videoPayoutRatePercent,
        })}
      </p>
      {error && (
        <p id={errorId} className="text-red-400 text-[11px] mt-1">
          {error}
        </p>
      )}
    </div>
  )
}

interface RegearEntryRowProps {
  entry: EntryState
  index: number
  roleReward: number
  ceilingMissing: boolean
  payoutRatePercent: number
  overchargePayoutRatePercent: number
  videoPayoutRatePercent: number
  hasValidVideoProof: boolean
  error: string
  showHeader: boolean
  canRemove?: boolean
  onSlotHover: (entryId: string, slot: 'primary' | 'secondary' | null) => void
  onRemove?: () => void
  onChange: (patch: Partial<EntryState>) => void
}

export function RegearEntryRow({
  entry,
  index,
  roleReward,
  ceilingMissing,
  payoutRatePercent,
  overchargePayoutRatePercent,
  videoPayoutRatePercent,
  hasValidVideoProof,
  error,
  showHeader,
  canRemove = false,
  onSlotHover,
  onRemove,
  onChange,
}: RegearEntryRowProps) {
  const t = useTranslations('regear')
  const parsedClaim = parseSilverInput(entry.claimedInput)
  const isOvercharge = entry.requestType === 'overcharge'
  const effectivePayoutRatePercent = isOvercharge
    ? overchargePayoutRatePercent
    : resolveRegearPreviewPayoutRatePercent({
        baseRatePercent: payoutRatePercent,
        videoRatePercent: videoPayoutRatePercent,
        hasVideoProof: hasValidVideoProof,
      })

  return (
    <div
      className={`space-y-2 rounded-xl border px-3 py-3 ${
        isOvercharge
          ? 'border-orange-500/30 bg-orange-500/5'
          : 'border-rose-500/30 bg-rose-500/5'
      }`}
    >
      {showHeader && (
        <div className="flex min-h-7 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-extrabold uppercase ${
                isOvercharge
                  ? 'bg-orange-500 text-black'
                  : 'bg-rose-500/20 text-rose-200'
              }`}
            >
              {isOvercharge ? t('entryTypeOverchargeBadge') : t('entryTypeDeathBadge')}
            </span>
            <span className="truncate text-[11px] font-semibold text-amber-300">
              {isOvercharge ? t('entryOverchargeLabel') : t('entryDeathLabel', { n: index + 1 })}
            </span>
          </div>
          {canRemove && onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-red-500/10 hover:text-red-300 active:scale-[0.96]"
              aria-label={t('removeEntry')}
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      )}

      <div>
        <label className="text-gray-400 text-[11px] font-semibold block mb-1">
          {t('claimAmount', { max: formatSilver(roleReward) })}
        </label>
        <input
          type="text"
          inputMode="numeric"
          placeholder={t('claimPlaceholder')}
          value={entry.claimedInput}
          onChange={(e) => onChange({ claimedInput: e.target.value })}
          disabled={ceilingMissing}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-base text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 font-mono disabled:opacity-50"
        />
        {ceilingMissing ? (
          <p className="text-red-400 text-[11px] mt-1">{t('ceilingNotSet')}</p>
        ) : (
          parsedClaim !== null && (
            <p className="text-gray-500 text-[11px] mt-1">
              {t('claimAmountPrefix')}{' '}
              <span className="font-mono text-gray-300">
                {t('claimAmountWithUnit', { amount: formatSilver(parsedClaim) })}
              </span>
              {parsedClaim > roleReward && (
                <span className="text-red-400 ml-2">{t('overCeiling')}</span>
              )}
              {parsedClaim <= roleReward &&
                (effectivePayoutRatePercent !== 100 || hasValidVideoProof) && (
                <span className="text-emerald-400 ml-2 font-mono">
                  {t('expectedPayout', {
                    amount: formatSilver(calcPayoutSilver(parsedClaim, effectivePayoutRatePercent)),
                    rate: effectivePayoutRatePercent,
                  })}
                </span>
              )}
            </p>
          )
        )}
      </div>

      <ScreenshotSlot
        entryId={entry.id}
        slot="primary"
        label={t('screenshotPrimaryLabel')}
        file={entry.file}
        onChange={(file) => onChange({ file })}
        onHover={(active) => onSlotHover(entry.id, active ? 'primary' : null)}
      />

      <ScreenshotSlot
        entryId={entry.id}
        slot="secondary"
        label={t('screenshotSecondaryLabel')}
        file={entry.file2}
        onChange={(file) => onChange({ file2: file })}
        onHover={(active) => onSlotHover(entry.id, active ? 'secondary' : null)}
      />

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-400 text-xs">{error}</p>
        </div>
      )}
    </div>
  )
}

interface ScreenshotSlotProps {
  entryId: string
  slot: 'primary' | 'secondary'
  label: string
  file: File | null
  onChange: (file: File | null) => void
  onHover: (active: boolean) => void
}

function ScreenshotSlot({ entryId, slot, label, file, onChange, onHover }: ScreenshotSlotProps) {
  const t = useTranslations('regear')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputId = `regear-screenshot-${entryId}-${slot}`

  useEffect(() => {
    if (!file) {
      // file 해제 → preview 비우기. URL.createObjectURL cleanup 패턴.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  return (
    <div onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)}>
      <label className="text-gray-400 text-[11px] font-semibold block mb-1">{label}</label>
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const dropped = e.dataTransfer.files?.[0]
          if (dropped && ACCEPTED_TYPES.includes(dropped.type)) {
            compressImageIfLarge(dropped).then(onChange)
          }
        }}
        className={`flex flex-col items-center justify-center gap-2 w-full rounded-lg cursor-pointer transition-colors overflow-hidden ${
          previewUrl
            ? 'bg-gray-800 border border-gray-700 hover:border-amber-500'
            : `bg-gray-800 border border-dashed ${dragging ? 'border-amber-500 text-amber-400' : 'border-gray-600 hover:border-amber-500 text-gray-400 hover:text-amber-400'} py-5`
        }`}
      >
        {previewUrl ? (
          // blob: URL.createObjectURL 기반 미리보기 — Next Image 가 다루지 못함.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt={t('screenshotAlt')} className="max-h-48 w-auto object-contain" />
        ) : (
          <>
            <Upload size={16} />
            <span className="text-xs">{t('pickOrPaste')}</span>
            <span className="inline-flex items-center gap-1 text-[10px] text-gray-500">
              <Clipboard size={10} />
              {t('pasteHint')}
            </span>
          </>
        )}
      </label>
      <input
        id={inputId}
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0] ?? null
          if (!picked) {
            onChange(null)
            return
          }
          compressImageIfLarge(picked).then(onChange)
        }}
      />
      {file && (
        <div className="flex items-center justify-between gap-2 mt-2 text-xs">
          <span className="text-gray-400 truncate flex-1" title={file.name}>
            {file.name}
          </span>
          <button
            type="button"
            onClick={() => {
              onChange(null)
              if (fileInputRef.current) fileInputRef.current.value = ''
            }}
            className="text-gray-500 hover:text-red-400 flex-shrink-0"
          >
            {t('remove')}
          </button>
        </div>
      )}
    </div>
  )
}

interface FulfillmentModeNoticeProps {
  craftEnabled: boolean
  includeCape?: boolean
  onIncludeCapeChange?: (includeCape: boolean) => void
}

export function FulfillmentModeNotice({
  craftEnabled,
  includeCape,
  onIncludeCapeChange,
}: FulfillmentModeNoticeProps) {
  const t = useTranslations('regear')
  const label = craftEnabled ? t('modeCraftedLabel') : t('modeSilverLabel')
  const hint = craftEnabled ? t('modeCraftedHint') : t('modeSilverHint')
  return (
    <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-3 space-y-1">
      <p className="text-amber-300 text-[11px] font-semibold">{t('modeNoticeLabel')}</p>
      <p className="text-xs font-bold text-amber-200">{label}</p>
      <p className="text-[10px] text-gray-400 leading-relaxed">{hint}</p>
      {craftEnabled && includeCape != null && onIncludeCapeChange && (
        <label className="mt-2 flex items-start gap-2 rounded-lg border border-gray-700 bg-gray-950/60 px-2.5 py-2">
          <input
            type="checkbox"
            checked={includeCape}
            onChange={(e) => onIncludeCapeChange(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span className="min-w-0">
            <span className="block text-[11px] font-semibold text-gray-200">
              {t('craftIncludeCapeLabel')}
            </span>
            <span className="block text-[10px] text-gray-500 leading-relaxed">
              {t('craftIncludeCapeHint')}
            </span>
          </span>
        </label>
      )}
    </div>
  )
}
