'use client'

import { CheckCircle2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface Props {
  embedded?: boolean
}

export default function EventAutoStartForm({ embedded = false }: Props) {
  const t = useTranslations('adminEventAutoStart')
  const containerClass = embedded
    ? 'space-y-3'
    : 'space-y-4 rounded-xl border border-gray-700 bg-gray-900 p-5'

  return (
    <section className={containerClass}>
      <div>
        {embedded ? (
          <h3 className="text-sm font-semibold text-white">{t('title')}</h3>
        ) : (
          <h2 className="font-bold text-white">{t('title')}</h2>
        )}
        <p className="mt-1 text-xs leading-relaxed text-gray-500">{t('description')}</p>
      </div>
      <div className="flex items-start gap-3 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.07] p-3">
        <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-300" />
        <span>
          <span className="block text-sm font-semibold text-emerald-100">
            {t('enabledLabel')}
          </span>
          <span className="mt-0.5 block text-[11px] leading-relaxed text-emerald-100/65">
            {t('enabledHint')}
          </span>
        </span>
      </div>
    </section>
  )
}
