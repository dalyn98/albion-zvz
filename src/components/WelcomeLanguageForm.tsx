'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Check, Loader2 } from 'lucide-react'
import { setMyPreferredLanguage } from '@/app/actions/language'
import { SUPPORTED_LOCALES, LOCALE_LABELS, type Locale } from '@/i18n/locales'
import { useToast } from './ToastProvider'

interface Props {
  returnTo: string
}

// 첫 방문 환영 화면의 언어 선택 폼. 3개 버튼 중 하나 클릭 시 서버 액션으로
// DB + 쿠키 저장 후 returnTo 로 이동. router.replace 를 쓰는 건 뒤로가기로
// 다시 이 페이지에 돌아오지 않게 하려는 의도.
export default function WelcomeLanguageForm({ returnTo }: Props) {
  const t = useTranslations('welcomeLanguage')
  const router = useRouter()
  const toast = useToast()
  const [pending, setPending] = useState<Locale | null>(null)

  const handleSelect = async (locale: Locale) => {
    if (pending) return
    setPending(locale)
    const res = await setMyPreferredLanguage(locale)
    if (res.error) {
      toast.error(t('saveFailed'))
      setPending(null)
      return
    }
    // Server Action 내부의 revalidatePath 가 레이아웃을 재검증하지만
    // 현재 페이지 자체가 언어 설정 후 불필요해지므로 replace 로 이동시킨다.
    router.replace(returnTo)
    router.refresh()
  }

  return (
    <div className="space-y-3">
      {SUPPORTED_LOCALES.map((locale) => {
        const isPending = pending === locale
        return (
          <button
            key={locale}
            type="button"
            onClick={() => handleSelect(locale)}
            disabled={!!pending}
            className="w-full flex items-center justify-between bg-gray-900 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed border border-gray-800 hover:border-amber-500/40 rounded-lg px-4 py-4 text-left transition-colors"
          >
            <span className="text-base font-semibold text-white">
              {LOCALE_LABELS[locale]}
            </span>
            {isPending ? (
              <Loader2 size={18} className="text-amber-400 animate-spin" />
            ) : (
              <Check size={18} className="text-gray-600" />
            )}
          </button>
        )
      })}
    </div>
  )
}
