'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ShieldCheck, X, Upload, Clipboard, Plus, Trash2 } from 'lucide-react'
import { requestRegear } from '@/app/actions/regear'
import { formatSilver, parseSilverInput } from '@/lib/silver'
import { calcPayoutSilver } from '@/lib/regear-payout'
import { useToast } from './ToastProvider'

interface Props {
  eventId: string
  roleName: string | null
  roleReward: number
  existingActiveCount: number
  maxDeaths: number
  windowMinutes: number
  // Current payout rate (1..100). If <100 we surface an "expected payout"
  // hint so the member isn't surprised when the credited amount differs from
  // their claim.
  payoutRatePercent: number
  battleStartedAt: string | null
}

interface EntryState {
  id: string
  file: File | null
  claimedInput: string
}

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_ENTRIES = 3

function newEntry(): EntryState {
  return {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    file: null,
    claimedInput: '',
  }
}

function formatWindowOpen(iso: string, windowMinutes: number): string {
  const openMs = new Date(iso).getTime() + windowMinutes * 60 * 1000
  // KST (UTC+9, no DST). Extract HH:mm by shifting into UTC+9.
  const shifted = new Date(openMs + 9 * 60 * 60 * 1000)
  return `${String(shifted.getUTCHours()).padStart(2, '0')}:${String(shifted.getUTCMinutes()).padStart(2, '0')}`
}

export default function RegearRequestButton({
  eventId,
  roleName,
  roleReward,
  existingActiveCount,
  maxDeaths,
  windowMinutes,
  payoutRatePercent,
  battleStartedAt,
}: Props) {
  const router = useRouter()
  const t = useTranslations('regear')
  const tToast = useTranslations('toast')
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<EntryState[]>(() => [newEntry()])
  const [entryErrors, setEntryErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const notStarted = !battleStartedAt
  const ceilingMissing = roleReward <= 0
  const atLimit = existingActiveCount >= maxDeaths
  const remaining = Math.max(0, maxDeaths - existingActiveCount)
  // Cap concurrent entries by both the product limit (3) and whatever deaths
  // the user has left on this event.
  const maxEntries = Math.max(1, Math.min(MAX_ENTRIES, remaining))
  // Client-side "waiting for killboard" check. Server re-validates; this is
  // just to keep the button from opening a modal that will error on submit.
  const windowOpenMs = battleStartedAt
    ? new Date(battleStartedAt).getTime() + windowMinutes * 60 * 1000
    : null
  const windowPending = windowOpenMs !== null && Date.now() < windowOpenMs
  const disabled = atLimit || !roleName || notStarted || ceilingMissing || windowPending
  const buttonLabel = atLimit
    ? t('buttonDone')
    : notStarted
      ? t('buttonNotStarted')
      : windowPending && battleStartedAt
        ? t('buttonWindowPending', { opensAt: formatWindowOpen(battleStartedAt, windowMinutes) })
        : ceilingMissing
          ? t('buttonCeilingMissing')
          : maxDeaths > 1 && existingActiveCount > 0
            ? t('buttonRequestRemaining', { remaining })
            : t('buttonRequest')

  const updateEntry = (id: string, patch: Partial<EntryState>) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  }

  const removeEntry = (id: string) => {
    setEntries((prev) => (prev.length <= 1 ? prev : prev.filter((e) => e.id !== id)))
    setEntryErrors((prev) => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  const addEntry = () => {
    setEntries((prev) => (prev.length >= maxEntries ? prev : [...prev, newEntry()]))
  }

  const resetModal = () => {
    setEntries([newEntry()])
    setEntryErrors({})
    setError('')
  }

  // Paste handler: drop the clipboard image into the first empty entry so a
  // rapid Ctrl-V workflow can fill multiple deaths in a row without clicking.
  useEffect(() => {
    if (!open) return
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      const target = entries.find((entry) => !entry.file)
      if (!target) return
      for (const item of items) {
        if (item.kind !== 'file') continue
        if (!ACCEPTED_TYPES.includes(item.type)) continue
        const blob = item.getAsFile()
        if (!blob) continue
        const ext = item.type.split('/')[1]
        const pasted = new File([blob], `clipboard-${Date.now()}.${ext}`, { type: item.type })
        updateEntry(target.id, { file: pasted })
        setEntryErrors((prev) => {
          if (!(target.id in prev)) return prev
          const next = { ...prev }
          delete next[target.id]
          return next
        })
        e.preventDefault()
        return
      }
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [open, entries])

  const submit = () => {
    if (ceilingMissing) {
      setError(t('ceilingNotSet'))
      return
    }
    const validated: { entry: EntryState; parsedClaim: number }[] = []
    const nextErrors: Record<string, string> = {}
    for (const entry of entries) {
      const hasFile = entry.file !== null
      const hasClaim = entry.claimedInput.trim().length > 0
      // Wholly empty rows are treated as unused — the user added a slot but
      // decided not to fill it. Only partially filled rows raise an error.
      if (!hasFile && !hasClaim) continue
      if (!hasFile) {
        nextErrors[entry.id] = t('screenshotMissing')
        continue
      }
      const parsed = parseSilverInput(entry.claimedInput)
      if (parsed === null || parsed <= 0) {
        nextErrors[entry.id] = t('claimInvalid')
        continue
      }
      if (parsed > roleReward) {
        nextErrors[entry.id] = t('claimOverCeiling', { ceiling: formatSilver(roleReward) })
        continue
      }
      validated.push({ entry, parsedClaim: parsed })
    }
    if (Object.keys(nextErrors).length > 0) {
      setEntryErrors(nextErrors)
      return
    }
    if (validated.length === 0) {
      setError(t('screenshotMissing'))
      return
    }
    setEntryErrors({})
    setError('')
    startTransition(async () => {
      const results: { id: string; error?: string }[] = []
      for (const { entry, parsedClaim } of validated) {
        const form = new FormData()
        form.append('eventId', eventId)
        form.append('screenshot', entry.file!)
        form.append('claimedSilver', parsedClaim.toString())
        const r = await requestRegear(form)
        results.push({ id: entry.id, error: r.error })
      }
      const succeededIds = new Set(results.filter((r) => !r.error).map((r) => r.id))
      const failed = results.filter((r) => r.error)
      if (failed.length === 0) {
        setOpen(false)
        resetModal()
        toast.success(
          succeededIds.size === 1
            ? tToast('regearSubmitted')
            : tToast('regearSubmittedMulti', { count: succeededIds.size }),
        )
      } else {
        setEntries((prev) => prev.filter((e) => !succeededIds.has(e.id)))
        const errMap: Record<string, string> = {}
        for (const r of failed) errMap[r.id] = r.error ?? ''
        setEntryErrors(errMap)
        if (succeededIds.size > 0) {
          toast.info(
            tToast('regearSubmittedPartial', {
              success: succeededIds.size,
              total: validated.length,
            }),
          )
        }
      }
      router.refresh()
    })
  }

  const canAddEntry = entries.length < maxEntries && !pending
  const canRemoveEntry = entries.length > 1 && !pending

  return (
    <>
      <button
        type="button"
        onClick={() => {
          resetModal()
          setOpen(true)
        }}
        disabled={disabled}
        className="flex items-center gap-1.5 text-xs font-medium text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-lg px-3 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <ShieldCheck size={13} />
        {buttonLabel}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center sm:p-6"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="bg-gray-900 border border-gray-700 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[92dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
              <h3 className="font-bold text-white text-base">{t('modalTitle')}</h3>
              <button
                type="button"
                onClick={() => !pending && setOpen(false)}
                className="p-1 text-gray-400 hover:text-white"
                aria-label={t('close')}
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 text-sm">
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">{t('role')}</span>
                  <span className="text-white font-semibold">{roleName ?? t('unassigned')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">{t('roleCeiling')}</span>
                  <span className="text-amber-400 font-mono font-semibold">{formatSilver(roleReward)}</span>
                </div>
                {battleStartedAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">{t('windowOpensAt')}</span>
                    <span className="text-gray-200 font-mono text-xs">{formatWindowOpen(battleStartedAt, windowMinutes)}</span>
                  </div>
                )}
                {maxDeaths > 1 && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">{t('deathsRemaining')}</span>
                    <span className="text-gray-200 font-mono text-xs">
                      {t('deathsRemainingValue', { remaining, max: maxDeaths })}
                    </span>
                  </div>
                )}
              </div>

              {maxEntries > 1 && (
                <p className="text-gray-500 text-[11px] leading-relaxed">
                  {t('multiHint', { max: maxEntries })}
                </p>
              )}

              <div className="space-y-4">
                {entries.map((entry, idx) => (
                  <RegearEntryRow
                    key={entry.id}
                    entry={entry}
                    index={idx}
                    roleReward={roleReward}
                    ceilingMissing={ceilingMissing}
                    payoutRatePercent={payoutRatePercent}
                    error={entryErrors[entry.id] ?? ''}
                    showHeader={entries.length > 1 || maxEntries > 1}
                    canRemove={canRemoveEntry}
                    onChange={(patch) => {
                      updateEntry(entry.id, patch)
                      if (entryErrors[entry.id]) {
                        setEntryErrors((prev) => {
                          const next = { ...prev }
                          delete next[entry.id]
                          return next
                        })
                      }
                    }}
                    onRemove={() => removeEntry(entry.id)}
                  />
                ))}
              </div>

              {canAddEntry && (
                <button
                  type="button"
                  onClick={addEntry}
                  className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-rose-300 bg-rose-500/5 hover:bg-rose-500/15 border border-dashed border-rose-500/40 rounded-lg px-3 py-2 transition-colors"
                >
                  <Plus size={13} />
                  {t('addEntry')}
                </button>
              )}

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                  <p className="text-red-400 text-xs">{error}</p>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-700">
              <button
                type="button"
                onClick={() => !pending && setOpen(false)}
                disabled={pending}
                className="text-gray-400 hover:text-white text-sm px-3 py-2"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending}
                className="bg-rose-500 hover:bg-rose-400 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-lg text-sm"
              >
                {pending ? t('submitting') : t('submit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

interface RegearEntryRowProps {
  entry: EntryState
  index: number
  roleReward: number
  ceilingMissing: boolean
  payoutRatePercent: number
  error: string
  showHeader: boolean
  canRemove: boolean
  onChange: (patch: Partial<EntryState>) => void
  onRemove: () => void
}

function RegearEntryRow({
  entry,
  index,
  roleReward,
  ceilingMissing,
  payoutRatePercent,
  error,
  showHeader,
  canRemove,
  onChange,
  onRemove,
}: RegearEntryRowProps) {
  const t = useTranslations('regear')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const parsedClaim = parseSilverInput(entry.claimedInput)
  const inputId = `regear-screenshot-${entry.id}`

  useEffect(() => {
    if (!entry.file) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(entry.file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [entry.file])

  return (
    <div className="space-y-2">
      {showHeader && (
        <div className="flex items-center justify-between">
          <span className="text-amber-400 text-[11px] font-semibold">
            {t('entryLabel', { n: index + 1 })}
          </span>
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-red-400"
            >
              <Trash2 size={11} />
              {t('removeEntry')}
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
              {parsedClaim <= roleReward && payoutRatePercent < 100 && (
                <span className="text-emerald-400 ml-2 font-mono">
                  {t('expectedPayout', {
                    amount: formatSilver(calcPayoutSilver(parsedClaim, payoutRatePercent)),
                    rate: payoutRatePercent,
                  })}
                </span>
              )}
            </p>
          )
        )}
      </div>

      <div>
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
              onChange({ file: dropped })
            }
          }}
          className={`flex flex-col items-center justify-center gap-2 w-full rounded-lg cursor-pointer transition-colors overflow-hidden ${
            previewUrl
              ? 'bg-gray-800 border border-gray-700 hover:border-amber-500'
              : `bg-gray-800 border border-dashed ${dragging ? 'border-amber-500 text-amber-400' : 'border-gray-600 hover:border-amber-500 text-gray-400 hover:text-amber-400'} py-6`
          }`}
        >
          {previewUrl ? (
            <img src={previewUrl} alt={t('screenshotAlt')} className="max-h-60 w-auto object-contain" />
          ) : (
            <>
              <Upload size={18} />
              <span className="text-sm">{t('pickOrPaste')}</span>
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
            onChange({ file: picked })
          }}
        />
        {entry.file && (
          <div className="flex items-center justify-between gap-2 mt-2 text-xs">
            <span className="text-gray-400 truncate flex-1" title={entry.file.name}>
              {entry.file.name}
            </span>
            <button
              type="button"
              onClick={() => {
                onChange({ file: null })
                if (fileInputRef.current) fileInputRef.current.value = ''
              }}
              className="text-gray-500 hover:text-red-400 flex-shrink-0"
            >
              {t('remove')}
            </button>
          </div>
        )}
        <p className="text-gray-500 text-xs mt-2 leading-relaxed">{t('uploadHint')}</p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-400 text-xs">{error}</p>
        </div>
      )}
    </div>
  )
}
