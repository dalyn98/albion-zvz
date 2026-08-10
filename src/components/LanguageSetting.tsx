'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { setMyPreferredLanguage } from '@/app/actions/language'
import { SUPPORTED_LOCALES, LOCALE_LABELS, type Locale } from '@/i18n/locales'
import { useToast } from './ToastProvider'

interface Props {
  initialLocale: Locale
}

// /me/settings 의 사용 언어 변경 섹션. WelcomeLanguageForm 과 구조는 비슷하지만
// 이쪽은 "현재 선택된 언어" 상태 표시가 필요하고, 네비게이션 대신 router.refresh
// 로 현재 페이지를 다시 렌더 (타 섹션 유지).
export default function LanguageSetting({ initialLocale }: Props) {
  const t = useTranslations('languageSetting')
  const router = useRouter()
  const toast = useToast()
  const [current, setCurrent] = useState<Locale>(initialLocale)
  const [pending, setPending] = useState<Locale | null>(null)

  const handleSelect = async (locale: Locale) => {
    if (pending || locale === current) return
    setPending(locale)
    const res = await setMyPreferredLanguage(locale)
    if (res.error) {
      toast.error(t('saveFailed'))
      setPending(null)
      return
    }
    setCurrent(locale)
    setPending(null)
    toast.success(t('saved'))
    // Server Action 의 revalidatePath('/','layout') 만으로는 클라이언트
     // 컴포넌트의 t() 가 갱신되지 않는 경우가 있어 명시적으로 refresh.
    router.refresh()
  }

  return (
    <section className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-4 space-y-3">
      <h2 className="text-sm font-semibold text-white">{t('title')}</h2>
      <p className="text-xs text-gray-400 leading-relaxed">{t('description')}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {SUPPORTED_LOCALES.map((locale) => {
          const isActive = current === locale
          const isPending = pending === locale
          return (
            <button
              key={locale}
              type="button"
              onClick={() => handleSelect(locale)}
              disabled={isPending}
              className={[
                'flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                isActive
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-200'
                  : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-amber-500/40 hover:text-white',
              ].join(' ')}
            >
              {isPending && <Loader2 size={12} className="animate-spin" />}
              {LOCALE_LABELS[locale]}
            </button>
          )
        })}
      </div>
    </section>
  )
}
