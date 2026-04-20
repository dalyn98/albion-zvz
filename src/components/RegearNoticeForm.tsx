'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { updateAppSetting } from '@/app/actions/settings'
import { Save, Eraser } from 'lucide-react'

interface Props {
  initialMessage: string
}

const MAX_LENGTH = 500

export default function RegearNoticeForm({ initialMessage }: Props) {
  const t = useTranslations('adminRegearNotice')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const [text, setText] = useState(initialMessage)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const dirty = text !== initialMessage
  const tooLong = text.length > MAX_LENGTH

  const handleSave = async () => {
    if (tooLong) {
      setError(t('tooLong', { max: MAX_LENGTH }))
      return
    }
    setLoading(true)
    setError('')
    setSaved(false)
    const result = await updateAppSetting('regear_notice_message', text)
    if (result.error) {
      setError(result.error)
    } else {
      setSaved(true)
      router.refresh()
    }
    setLoading(false)
  }

  const handleClear = () => {
    setText('')
    setSaved(false)
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
      <div>
        <h2 className="font-bold text-white">{t('title')}</h2>
        <p className="text-gray-500 text-xs mt-1">{t('description')}</p>
      </div>

      <div>
        <label className="text-gray-400 text-xs mb-1 block">{t('label')}</label>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setSaved(false)
          }}
          rows={3}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 resize-y"
          placeholder={t('placeholder')}
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
          onClick={handleClear}
          disabled={loading || text === ''}
          className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800/40 disabled:text-gray-600 text-gray-300 px-3 py-2 rounded-lg transition-colors text-xs"
          title={t('clearTooltip')}
        >
          <Eraser size={12} />
          {t('clear')}
        </button>
      </div>
    </div>
  )
}
