'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { updateAppSetting } from '@/app/actions/settings'
import { Save, Shuffle, Copy, Check, Trash2 } from 'lucide-react'

interface Props {
  initialToken: string
  // Passed from the server so the copy-link preview uses the deployed origin
  // rather than whatever host the admin is typing from.
  origin: string
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{0,64}$/

// Use crypto.getRandomValues + base64url (no dashes in the URL, 24 bytes = 192
// bits entropy). Fallback if randomUUID is unavailable — both should work in
// any modern browser.
function randomToken(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export default function GuestInviteSettingsForm({ initialToken, origin }: Props) {
  const t = useTranslations('adminGuestInvite')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const [token, setToken] = useState(initialToken)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)

  const dirty = token !== initialToken
  const patternOk = TOKEN_PATTERN.test(token)

  // Use the persisted token (not the unsaved `token` state) so the copy link
  // always reflects what guests entering the site will see.
  const inviteLink = useMemo(() => {
    if (!initialToken) return ''
    return `${origin}/?invite=${encodeURIComponent(initialToken)}`
  }, [initialToken, origin])

  const handleSave = async () => {
    if (!patternOk) {
      setError(t('patternError'))
      return
    }
    setLoading(true)
    setError('')
    setSaved(false)
    const result = await updateAppSetting('guest_invite_token', token)
    if (result.error) {
      setError(result.error)
    } else {
      setSaved(true)
      router.refresh()
    }
    setLoading(false)
  }

  const handleRandomize = () => {
    setToken(randomToken())
    setSaved(false)
  }

  const handleClear = () => {
    setToken('')
    setSaved(false)
  }

  const handleCopy = async () => {
    if (!inviteLink) return
    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setError(t('copyFailed'))
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
      <div>
        <h2 className="font-bold text-white">{t('title')}</h2>
        <p className="text-gray-500 text-xs mt-1 whitespace-pre-wrap">{t('description')}</p>
      </div>

      <div>
        <label className="text-gray-400 text-xs mb-1 block">{t('tokenLabel')}</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={token}
            onChange={(e) => {
              setToken(e.target.value)
              setSaved(false)
            }}
            placeholder={t('tokenPlaceholder')}
            spellCheck={false}
            autoComplete="off"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white font-mono placeholder-gray-600 focus:outline-none focus:border-amber-500"
          />
          <button
            type="button"
            onClick={handleRandomize}
            className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded-lg text-xs"
            title={t('randomize')}
          >
            <Shuffle size={12} />
            {t('randomize')}
          </button>
        </div>
        <p className="text-[11px] text-gray-500 mt-1">{t('patternHint')}</p>
      </div>

      {inviteLink && (
        <div>
          <label className="text-gray-400 text-xs mb-1 block">{t('linkLabel')}</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={inviteLink}
              readOnly
              className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 font-mono focus:outline-none"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded-lg text-xs"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? tCommon('copied') : tCommon('copy')}
            </button>
          </div>
          <p className="text-[11px] text-gray-500 mt-1">{t('linkHint')}</p>
        </div>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-3 py-2 text-red-300 text-xs">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={handleSave}
          disabled={loading || !dirty || !patternOk}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-4 py-2 rounded-lg transition-colors text-sm"
        >
          <Save size={14} />
          {loading ? tCommon('saving') : tCommon('save')}
        </button>
        <button
          type="button"
          onClick={handleClear}
          disabled={loading || token === ''}
          className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800/40 disabled:text-gray-600 text-gray-300 px-3 py-2 rounded-lg text-xs"
          title={t('clearTooltip')}
        >
          <Trash2 size={12} />
          {t('clear')}
        </button>
        {saved && !dirty && <span className="text-[11px] text-emerald-400">{tCommon('saved')}</span>}
      </div>
    </div>
  )
}
