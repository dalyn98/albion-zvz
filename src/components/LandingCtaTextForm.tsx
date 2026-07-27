'use client'

import { getServerActionClientErrorMessage } from '@/lib/server-action-client-error'
import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { updateAppSetting } from '@/app/actions/settings'
import { Save, RotateCcw } from 'lucide-react'
import { useReportDirty } from './UnsavedChangesProvider'

interface Props {
  initialText: string
  defaultText: string
}

const MAX_LENGTH = 500

export default function LandingCtaTextForm({ initialText, defaultText }: Props) {
  const t = useTranslations('adminLanding')
  const tActionErrors = useTranslations('errors')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const ctaId = useId()
  const [text, setText] = useState(initialText)
  // 저장 성공 시 즉시 savedText 를 새 값으로 sync — router.refresh 가 새 prop
  // 을 가져오기 전까지 dirty 가 stale-true 로 남아 false-alarm 가드가 뜨는 것을 막는다.
  const [savedText, setSavedText] = useState(initialText)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const dirty = text !== savedText
  const tooLong = text.length > MAX_LENGTH
  useReportDirty('landing-cta-text', dirty)

  const handleSave = async () => {
                                   try {
      if (tooLong) {
        setError(t('ctaTooLong', { max: MAX_LENGTH }))
        return
      }
      setLoading(true)
      setError('')
      setSaved(false)
      const result = await updateAppSetting('landing_cta_text', text)
      if (result.error) {
        setError(result.error)
      } else {
        setSavedText(text)
        setSaved(true)
        router.refresh()
      }
      setLoading(false)
                                   } catch (actionError) {
                                     setError(getServerActionClientErrorMessage(actionError, {
                                       expired: tActionErrors('actionExpired'),
                                       fallback: tActionErrors('actionFailed'),
                                     }))
                                   } finally {
                                     setLoading(false)
                                   }
                                 }

  const handleResetToDefault = () => {
    setText('')
    setSaved(false)
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
      <div>
        <h2 className="font-bold text-white">{t('ctaTitle')}</h2>
        <p className="text-gray-500 text-xs mt-1">
          {t('ctaDescription')}
        </p>
        <p className="text-gray-500 text-[11px] mt-1">
          {t('ctaDefaultPrefix')}: <span className="text-gray-400">{defaultText}</span>
        </p>
      </div>

      <div>
        <label htmlFor={ctaId} className="text-gray-400 text-xs mb-1 block">{t('ctaLabel')}</label>
        <textarea
          id={ctaId}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setSaved(false)
          }}
          rows={2}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 resize-y"
          placeholder={defaultText}
        />
        <div className="flex items-center justify-between mt-1">
          <span className={`text-[11px] ${tooLong ? 'text-red-400' : 'text-gray-500'}`}>
            {text.length}/{MAX_LENGTH}
          </span>
          {saved && !dirty && <span className="text-[11px] text-emerald-400">{tCommon('saved')}</span>}
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-3 py-2 text-red-300 text-xs">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={loading || !dirty || tooLong}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-4 py-2 rounded-lg transition-colors text-sm"
        >
          <Save size={14} />
          {loading ? tCommon('saving') : tCommon('save')}
        </button>
        <button
          type="button"
          onClick={handleResetToDefault}
          disabled={loading || text === ''}
          className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800/40 disabled:text-gray-600 text-gray-300 px-3 py-2 rounded-lg transition-colors text-xs"
          title={t('ctaResetTooltip')}
        >
          <RotateCcw size={12} />
          {t('ctaResetToDefault')}
        </button>
      </div>
    </div>
  )
}
