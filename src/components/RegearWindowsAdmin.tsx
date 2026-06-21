'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Plus, Lock, Trash2 } from 'lucide-react'
import {
  openRegearWindow,
  listRegearWindows,
  closeRegearWindow,
  deleteRegearWindow,
  type RegearWindow,
} from '@/app/actions/regear-windows'
import {
  parseGatherTime,
  formatGatherTimeFor,
  type GatherTimeParts,
} from '@/lib/gather-time'
import FourPartTimeInput, { BLANK_GATHER_PARTS, isAllBlank } from './FourPartTimeInput'
import { formatDateTime } from '@/lib/format-datetime'
import { useConfirm } from '@/components/ConfirmDialog'
import { useToast } from '@/components/ToastProvider'
import type { Locale } from '@/i18n/locales'
import { EmptyState, SectionCard } from '@/components/ui-patterns'

interface RegearWindowsAdminProps {
  initialWindows: RegearWindow[]
  tenantTimezone: string
}

export default function RegearWindowsAdmin({ initialWindows, tenantTimezone }: RegearWindowsAdminProps) {
  const locale = useLocale() as Locale
  const t = useTranslations('adminRegearWindows')
  const router = useRouter()
  const [windows, setWindows] = useState<RegearWindow[]>(initialWindows)
  const [isPending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)
  const [parts, setParts] = useState<GatherTimeParts>(BLANK_GATHER_PARTS)
  const askConfirm = useConfirm()
  const toast = useToast()

  const allBlank = isAllBlank(parts)
  const parsed = allBlank ? null : parseGatherTime(parts, { timezone: tenantTimezone })
  const preview = parsed ? formatGatherTimeFor(locale, parsed, tenantTimezone) : null

  const partLabels = {
    month: t('partMonth'),
    day: t('partDay'),
    hour: t('partHour'),
    minute: t('partMinute'),
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
      setParts(BLANK_GATHER_PARTS)
      const latest = await listRegearWindows('all')
      if (latest.error) {
        toast.error(latest.error)
      } else {
        setWindows(latest.windows)
      }
      router.refresh()
    })
  }

  async function handleClose(id: string) {
    const ok = await askConfirm({ body: t('confirmClose'), destructive: true })
    if (!ok) return
    startTransition(async () => {
      const res = await closeRegearWindow(id)
      if (res.error) {
        toast.error(res.error)
        return
      }
      setWindows((prev) =>
        prev.map((w) =>
          w.id === id
            ? { ...w, closedAt: new Date().toISOString(), isOpen: false }
            : w,
        ),
      )
      router.refresh()
    })
  }

  async function handleDelete(id: string) {
    const ok = await askConfirm({ body: t('confirmDelete'), destructive: true })
    if (!ok) return
    startTransition(async () => {
      const res = await deleteRegearWindow(id)
      if (res.error) {
        toast.error(res.error)
        return
      }
      setWindows((prev) => prev.filter((w) => w.id !== id))
      router.refresh()
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
      <SectionCard>
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
              <FourPartTimeInput parts={parts} onChange={setParts} labels={partLabels} size="compact" />
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
      </SectionCard>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-white">
          {t('openListTitle')}{' '}
          <span className="text-xs text-gray-500">({openWindows.length})</span>
        </h2>
        {openWindows.length === 0 ? (
          <EmptyState icon={Lock} title={t('openListEmpty')} />
        ) : (
          <ul className="space-y-2">
            {openWindows.map((w) => (
              <WindowRow
                key={w.id}
                window={w}
                onClose={handleClose}
                onDelete={handleDelete}
                disabled={isPending}
                tenantTimezone={tenantTimezone}
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
                tenantTimezone={tenantTimezone}
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
  tenantTimezone: string
}

function WindowRow({ window: w, onClose, onDelete, disabled, tenantTimezone }: WindowRowProps) {
  const t = useTranslations('adminRegearWindows')

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
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
              ts: formatDateTime(w.opensAt, tenantTimezone),
            })}
          </span>
          {w.closesAt && (
            <span>
              {t('metaClosesAt', {
                ts: formatDateTime(w.closesAt, tenantTimezone),
              })}
            </span>
          )}
          {w.closedAt && (
            <span>
              {t('metaClosedBy', {
                ts: formatDateTime(w.closedAt, tenantTimezone),
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
