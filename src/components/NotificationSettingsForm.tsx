'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { updateAppSetting } from '@/app/actions/settings'
import { Save } from 'lucide-react'

interface Props {
  initialMessage: string
  embedded?: boolean
}

const MAX_LENGTH = 500

export default function NotificationSettingsForm({ initialMessage, embedded = false }: Props) {
  const t = useTranslations('adminSettings')
  const router = useRouter()
  const messageId = useId()
  const [message, setMessage] = useState(initialMessage)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const dirty = message !== initialMessage
  const tooLong = message.length > MAX_LENGTH

  const handleSave = async () => {
    if (!message.trim()) {
      setError(t('messageEmpty'))
      return
    }
    if (tooLong) {
      setError(t('messageTooLong', { max: MAX_LENGTH }))
      return
    }
    setLoading(true)
    setError('')
    setSaved(false)
    const result = await updateAppSetting('event_notification_message', message)
    if (result.error) {
      setError(result.error)
    } else {
      setSaved(true)
      router.refresh()
    }
    setLoading(false)
  }

  const containerClass = embedded
    ? 'space-y-3'
    : 'bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4'

  return (
    <div className={containerClass}>
      <div>
        {embedded ? (
          <h3 className="font-semibold text-white text-sm">{t('notificationsTitle')}</h3>
        ) : (
          <h2 className="font-bold text-white">{t('notificationsTitle')}</h2>
        )}
        <p className="text-gray-500 text-xs mt-1">
          {t('notificationsDescription')}
        </p>
      </div>

      <div>
        <label htmlFor={messageId} className="text-gray-400 text-xs mb-1 block">{t('messageLabel')}</label>
        <textarea
          id={messageId}
          value={message}
          onChange={(e) => {
            setMessage(e.target.value)
            setSaved(false)
          }}
          rows={3}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 resize-y"
          placeholder={t('messagePlaceholder')}
        />
        <div className="flex items-center justify-between mt-1">
          <span className={`text-[11px] ${tooLong ? 'text-red-400' : 'text-gray-500'}`}>
            {message.length}/{MAX_LENGTH}
          </span>
          {saved && !dirty && <span className="text-[11px] text-emerald-400">{t('saved')}</span>}
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-3 py-2 text-red-300 text-xs">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={loading || !dirty || tooLong}
        className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-4 py-2 rounded-lg transition-colors text-sm"
      >
        <Save size={14} />
        {loading ? t('saving') : t('save')}
      </button>
    </div>
  )
}
