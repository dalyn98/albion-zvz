'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Check, Loader2, NotebookTabs, PackageOpen } from 'lucide-react'
import { updateAppSetting } from '@/app/actions/settings'
import type { SiphonAccountingMode } from '@/lib/siphon/accounting-mode'

export default function SiphonAccountingModeForm({
  initialMode,
}: {
  initialMode: SiphonAccountingMode
}) {
  const t = useTranslations('adminSiphonPage')
  const router = useRouter()
  const [mode, setMode] = useState(initialMode)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const save = () => {
    setError('')
    setSaved(false)
    startTransition(async () => {
      const result = await updateAppSetting('siphon_accounting_mode', mode)
      if (result.error) {
        setError(result.error)
        return
      }
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <section className="rounded-xl border border-gray-700 bg-gray-900 p-5 space-y-4">
      <div>
        <h2 className="font-bold text-white">{t('modeTitle')}</h2>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">{t('modeDescription')}</p>
      </div>
      <div
        role="radiogroup"
        aria-label={t('modeTitle')}
        className="grid gap-3 md:grid-cols-2"
      >
        <ModeCard
          selected={mode === 'record'}
          icon={<NotebookTabs size={18} />}
          title={t('modeRecordTitle')}
          description={t('modeRecordDescription')}
          onSelect={() => {
            setMode('record')
            setSaved(false)
          }}
        />
        <ModeCard
          selected={mode === 'personal_custody'}
          icon={<PackageOpen size={18} />}
          title={t('modeCustodyTitle')}
          description={t('modeCustodyDescription')}
          onSelect={() => {
            setMode('personal_custody')
            setSaved(false)
          }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending || mode === initialMode}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-black hover:bg-amber-400 disabled:bg-gray-800 disabled:text-gray-500"
        >
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          {t('modeSave')}
        </button>
        {saved && <span className="text-xs text-emerald-300">{t('modeSaved')}</span>}
        {error && <span className="text-xs text-rose-300">{error}</span>}
      </div>
    </section>
  )
}

function ModeCard({
  selected,
  icon,
  title,
  description,
  onSelect,
}: {
  selected: boolean
  icon: ReactNode
  title: string
  description: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`rounded-xl border p-4 text-left transition-colors ${
        selected
          ? 'border-amber-400/60 bg-amber-500/10 text-amber-100'
          : 'border-gray-800 bg-gray-950/50 text-gray-300 hover:border-gray-700'
      }`}
    >
      <span className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </span>
      <span className="mt-2 block text-xs leading-relaxed opacity-75">{description}</span>
    </button>
  )
}
