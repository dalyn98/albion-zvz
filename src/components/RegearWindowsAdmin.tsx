'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, Lock, Trash2 } from 'lucide-react'
import {
  openRegearWindow,
  closeRegearWindow,
  deleteRegearWindow,
  type RegearWindow,
} from '@/app/actions/regear-windows'
import {
  parseGatherTime,
  formatGatherTimeKo,
  type GatherTimeParts,
} from '@/lib/gather-time'

interface RegearWindowsAdminProps {
  initialWindows: RegearWindow[]
}

type PartKey = keyof GatherTimeParts

const PART_BOUNDS: Record<PartKey, { min: number; max: number }> = {
  month:  { min: 1, max: 12 },
  day:    { min: 1, max: 31 },
  hour:   { min: 0, max: 23 },
  minute: { min: 0, max: 59 },
}

const BLANK_PARTS: GatherTimeParts = {
  month: Number.NaN,
  day: Number.NaN,
  hour: Number.NaN,
  minute: Number.NaN,
}

export default function RegearWindowsAdmin({ initialWindows }: RegearWindowsAdminProps) {
  const t = useTranslations('adminRegearWindows')
  const [windows, setWindows] = useState<RegearWindow[]>(initialWindows)
  const [isPending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)
  const [parts, setParts] = useState<GatherTimeParts>(BLANK_PARTS)

  const allBlank = (Object.keys(parts) as PartKey[]).every((k) =>
    Number.isNaN(parts[k]),
  )
  const parsed = allBlank ? null : parseGatherTime(parts)
  const preview = parsed ? formatGatherTimeKo(parsed) : null

  const partSuffix = (key: PartKey): string => {
    if (key === 'month') return t('partMonth')
    if (key === 'day') return t('partDay')
    if (key === 'hour') return t('partHour')
    return t('partMinute')
  }

  const handlePartChange = (key: PartKey, raw: string) => {
    const next = raw === '' ? Number.NaN : Number(raw)
    setParts((prev) => ({ ...prev, [key]: next }))
  }

  function refreshFromServer() {
    fetch('/admin/dashboard/regear-windows', { cache: 'no-store' })
      .catch(() => null)
      .finally(() => {
        // server-side `dynamic` revalidation will refresh on next nav; we also
        // optimistically update local state from action results below.
      })
  }

  async function handleSubmit(formData: FormData) {
    setFormError(null)

    // closesAt 은 선택. 4칸 모두 빈 채로 두면 무기한 (직접 마감) 으로 간주.
    // 일부만 입력된 상태는 사용자 실수로 보고 차단한다.
    if (allBlank) {
      formData.set('closesAt', '')
    } else if (parsed) {
      formData.set('closesAt', parsed.toISOString())
    } else {
      setFormError(t('closesAtIncomplete'))
      return
    }

    startTransition(async () => {
      const res = await openRegearWindow(formData)
      if (res.error) {
        setFormError(res.error)
        return
      }
      const form = document.getElementById('regear-window-form') as HTMLFormElement | null
      form?.reset()
      setParts(BLANK_PARTS)
      refreshFromServer()
      if (typeof window !== 'undefined') window.location.reload()
    })
  }

  async function handleClose(id: string) {
    if (!confirm(t('confirmClose'))) return
    startTransition(async () => {
      const res = await closeRegearWindow(id)
      if (res.error) {
        alert(res.error)
        return
      }
      setWindows((prev) =>
        prev.map((w) =>
          w.id === id
            ? { ...w, closedAt: new Date().toISOString(), isOpen: false }
            : w,
        ),
      )
    })
  }

  async function handleDelete(id: string) {
    if (!confirm(t('confirmDelete'))) return
    startTransition(async () => {
      const res = await deleteRegearWindow(id)
      if (res.error) {
        alert(res.error)
        return
      }
      setWindows((prev) => prev.filter((w) => w.id !== id))
    })
  }

  const openWindows = windows.filter((w) => w.isOpen)
  const closedWindows = windows.filter((w) => !w.isOpen)

  const closesAtMessage = (() => {
    if (preview) return { tone: 'preview' as const, text: t('closesAtPreview', { value: preview }) }
    if (allBlank) return { tone: 'hint' as const, text: t('fieldClosesAtHint') }
    return { tone: 'error' as const, text: t('closesAtIncomplete') }
  })()

  const closesAtToneClass =
    closesAtMessage.tone === 'preview'
      ? 'text-amber-300'
      : closesAtMessage.tone === 'error'
        ? 'text-red-400'
        : 'text-gray-500'

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-800 bg-gray-900/40 p-4 sm:p-5">
        <h2 className="text-base font-semibold text-white mb-3">{t('formTitle')}</h2>
        <form
          id="regear-window-form"
          action={handleSubmit}
          className="space-y-3"
        >
          <div>
            <label htmlFor="rw-title" className="block text-xs font-medium text-gray-400 mb-1">
              {t('fieldTitle')}
            </label>
            <input
              id="rw-title"
              name="title"
              type="text"
              maxLength={100}
              required
              className="w-full rounded-md bg-gray-950 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-400"
              placeholder={t('fieldTitlePlaceholder')}
            />
          </div>
          <div>
            <label htmlFor="rw-description" className="block text-xs font-medium text-gray-400 mb-1">
              {t('fieldDescription')}
            </label>
            <textarea
              id="rw-description"
              name="description"
              rows={2}
              className="w-full rounded-md bg-gray-950 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-400"
              placeholder={t('fieldDescriptionPlaceholder')}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="rw-max-deaths" className="block text-xs font-medium text-gray-400 mb-1">
                {t('fieldMaxDeaths')}
              </label>
              <input
                id="rw-max-deaths"
                name="maxDeathsPerMember"
                type="number"
                min={1}
                max={20}
                defaultValue={1}
                required
                className="w-full rounded-md bg-gray-950 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                {t('fieldClosesAt')}
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {(Object.keys(PART_BOUNDS) as PartKey[]).map((key) => {
                  const bounds = PART_BOUNDS[key]
                  const value = parts[key]
                  const suffix = partSuffix(key)
                  return (
                    <div key={key} className="relative">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={bounds.min}
                        max={bounds.max}
                        value={Number.isNaN(value) ? '' : value}
                        onChange={(e) => handlePartChange(key, e.target.value)}
                        className="w-full rounded-md bg-gray-950 border border-gray-700 pl-2 pr-5 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        aria-label={suffix}
                      />
                      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-500 text-xs pointer-events-none">
                        {suffix}
                      </span>
                    </div>
                  )
                })}
              </div>
              <p className={`text-[11px] mt-1 ${closesAtToneClass}`}>
                {closesAtMessage.text}
              </p>
            </div>
          </div>
          {formError && (
            <p className="text-xs text-red-400">{formError}</p>
          )}
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 hover:bg-amber-400 disabled:bg-amber-700/50 disabled:cursor-not-allowed px-4 py-2 text-sm font-bold text-black transition-colors"
          >
            <Plus size={16} />
            {t('submitOpen')}
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">
          {t('openListTitle')}{' '}
          <span className="text-xs text-gray-500">({openWindows.length})</span>
        </h2>
        {openWindows.length === 0 ? (
          <p className="text-sm text-gray-500">{t('openListEmpty')}</p>
        ) : (
          <ul className="space-y-2">
            {openWindows.map((w) => (
              <WindowRow
                key={w.id}
                window={w}
                onClose={handleClose}
                onDelete={handleDelete}
                disabled={isPending}
              />
            ))}
          </ul>
        )}
      </section>

      {closedWindows.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-white">
            {t('closedListTitle')}{' '}
            <span className="text-xs text-gray-500">({closedWindows.length})</span>
          </h2>
          <ul className="space-y-2">
            {closedWindows.map((w) => (
              <WindowRow
                key={w.id}
                window={w}
                onClose={handleClose}
                onDelete={handleDelete}
                disabled={isPending}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

interface WindowRowProps {
  window: RegearWindow
  onClose: (id: string) => void
  onDelete: (id: string) => void
  disabled: boolean
}

function WindowRow({ window: w, onClose, onDelete, disabled }: WindowRowProps) {
  const t = useTranslations('adminRegearWindows')

  return (
    <li className="rounded-lg border border-gray-800 bg-gray-900/40 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
              w.isOpen
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'bg-gray-700/50 text-gray-400'
            }`}
          >
            {w.isOpen ? t('statusOpen') : t('statusClosed')}
          </span>
          <h3 className="text-sm font-medium text-white truncate">{w.title}</h3>
        </div>
        {w.description && (
          <p className="text-xs text-gray-400 mt-1 line-clamp-2">{w.description}</p>
        )}
        <div className="mt-1.5 text-[11px] text-gray-500 flex flex-wrap gap-x-3 gap-y-0.5">
          <span>
            {t('metaMaxDeaths', { count: w.maxDeathsPerMember })}
          </span>
          <span>
            {t('metaOpensAt', {
              ts: new Date(w.opensAt).toLocaleString(),
            })}
          </span>
          {w.closesAt && (
            <span>
              {t('metaClosesAt', {
                ts: new Date(w.closesAt).toLocaleString(),
              })}
            </span>
          )}
          {w.closedAt && (
            <span>
              {t('metaClosedBy', {
                ts: new Date(w.closedAt).toLocaleString(),
                by: w.closedByUsername ?? '?',
              })}
            </span>
          )}
          {w.createdByUsername && (
            <span>{t('metaCreatedBy', { by: w.createdByUsername })}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {w.isOpen && (
          <button
            type="button"
            onClick={() => onClose(w.id)}
            disabled={disabled}
            className="inline-flex items-center gap-1 rounded-md border border-gray-700 hover:border-amber-400 px-3 py-1.5 text-xs text-gray-300 hover:text-amber-300 transition-colors disabled:opacity-50"
          >
            <Lock size={12} />
            {t('btnClose')}
          </button>
        )}
        <button
          type="button"
          onClick={() => onDelete(w.id)}
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-md border border-gray-700 hover:border-rose-500 px-3 py-1.5 text-xs text-gray-300 hover:text-rose-300 transition-colors disabled:opacity-50"
        >
          <Trash2 size={12} />
          {t('btnDelete')}
        </button>
      </div>
    </li>
  )
}
