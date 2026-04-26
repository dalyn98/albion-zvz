'use client'

import { useState } from 'react'
import { Copy, Check, MessageCircle, UserPlus } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface Props {
  inviteUrl: string
  guildName: string
}

type CopyTarget = 'url' | 'message'

export default function MemberInviteCard({ inviteUrl, guildName }: Props) {
  const t = useTranslations('memberInvite')
  const [copied, setCopied] = useState<CopyTarget | null>(null)
  const [error, setError] = useState('')

  const messageTemplate = t('messageTemplate', { guildName, inviteUrl })

  const handleCopy = async (target: CopyTarget, value: string) => {
    setError('')
    try {
      await navigator.clipboard.writeText(value)
      setCopied(target)
      setTimeout(() => setCopied((prev) => (prev === target ? null : prev)), 1500)
    } catch {
      setError(t('copyFailed'))
    }
  }

  return (
    <section className="rounded-xl border border-emerald-400/30 bg-emerald-500/5 p-4 sm:p-5 space-y-3">
      <div className="flex items-start gap-3">
        <UserPlus size={18} className="text-emerald-300 mt-0.5 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-emerald-100">{t('title')}</h2>
          <p className="text-xs text-emerald-100/70 mt-1 leading-relaxed">
            {t('description')}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          readOnly
          value={inviteUrl}
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 min-w-0 bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-xs sm:text-sm text-gray-200 font-mono focus:outline-none focus:border-emerald-400/40"
          aria-label={t('urlAriaLabel')}
        />
        <button
          type="button"
          onClick={() => handleCopy('url', inviteUrl)}
          className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-bold px-3 py-2 rounded-lg text-xs sm:text-sm transition-colors flex-shrink-0"
        >
          {copied === 'url' ? <Check size={14} /> : <Copy size={14} />}
          <span className="hidden sm:inline">
            {copied === 'url' ? t('copied') : t('copyUrl')}
          </span>
        </button>
      </div>

      <details className="group">
        <summary className="flex items-center gap-2 cursor-pointer text-xs text-emerald-200/80 hover:text-emerald-100 select-none list-none">
          <MessageCircle size={13} />
          <span>{t('toggleMessage')}</span>
          <span className="text-emerald-300/50 group-open:hidden">▾</span>
          <span className="text-emerald-300/50 hidden group-open:inline">▴</span>
        </summary>
        <div className="mt-3 space-y-2">
          <textarea
            readOnly
            value={messageTemplate}
            rows={5}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-200 font-mono focus:outline-none focus:border-emerald-400/40 resize-none"
            aria-label={t('messageAriaLabel')}
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => handleCopy('message', messageTemplate)}
              className="flex items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-200 font-semibold px-3 py-1.5 rounded-lg text-xs transition-colors"
            >
              {copied === 'message' ? <Check size={12} /> : <Copy size={12} />}
              {copied === 'message' ? t('copied') : t('copyMessage')}
            </button>
          </div>
        </div>
      </details>

      {error && (
        <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </section>
  )
}
