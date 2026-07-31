'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { FlaskConical, Save } from 'lucide-react'
import { updateAppSetting } from '@/app/actions/settings'
import { getServerActionClientErrorMessage } from '@/lib/server-action-client-error'
import { useReportDirty } from './UnsavedChangesProvider'

export default function TacticsExperimentalSettingsForm({
  initialEnabled,
  embedded = false,
}: {
  initialEnabled: boolean
  embedded?: boolean
}) {
  const router = useRouter()
  const common = useTranslations('common')
  const errors = useTranslations('errors')
  const t = useTranslations('adminTacticsExperimental')
  const [enabled, setEnabled] = useState(initialEnabled)
  const [savedEnabled, setSavedEnabled] = useState(initialEnabled)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const dirty = enabled !== savedEnabled
  useReportDirty('tactics-experimental-setting', dirty)

  async function save() {
    try {
      setPending(true)
      setError('')
      setSaved(false)
      const result = await updateAppSetting(
        'tactics_experimental_enabled',
        enabled ? 'true' : 'false',
      )
      if (result.error) {
        setError(result.error)
        return
      }
      setSavedEnabled(enabled)
      setSaved(true)
      router.refresh()
    } catch (actionError) {
      setError(
        getServerActionClientErrorMessage(actionError, {
          expired: errors('actionExpired'),
          fallback: errors('actionFailed'),
        }),
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <div className={embedded ? 'space-y-3' : 'space-y-4 rounded-xl border border-gray-700 bg-gray-900 p-5'}>
      <div className="flex items-start gap-2">
        <FlaskConical size={16} className="mt-0.5 shrink-0 text-violet-300" />
        <div>
          <h3 className="text-sm font-semibold text-white">{t('title')}</h3>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            {t('description')}
          </p>
        </div>
      </div>

      <label className="flex cursor-pointer select-none items-start gap-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => {
            setEnabled(event.target.checked)
            setSaved(false)
          }}
          className="mt-1 h-4 w-4 accent-violet-500"
        />
        <span>
          <span className="text-sm font-semibold text-white">{t('toggleLabel')}</span>
          <span className="mt-0.5 block text-[11px] leading-relaxed text-gray-500">
            {enabled ? t('enabledHint') : t('disabledHint')}
          </span>
        </span>
      </label>

      {error && (
        <p role="alert" className="rounded-lg border border-red-700 bg-red-900/30 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="inline-flex items-center gap-2 rounded-lg bg-violet-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-violet-400 disabled:bg-gray-700 disabled:text-gray-500"
        >
          <Save size={14} />
          {pending ? common('saving') : common('save')}
        </button>
        {saved && !dirty && (
          <span role="status" className="text-[11px] text-emerald-400">
            {common('saved')}
          </span>
        )}
      </div>
    </div>
  )
}
