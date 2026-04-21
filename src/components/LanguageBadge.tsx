import { LOCALE_LABELS, type Locale } from '@/i18n/locales'

interface Props {
  locale: Locale | null
  size?: 'sm' | 'xs'
}

// 멤버 카드/상세에서 사용 언어 표시. null 이면 아직 선택 안한 사용자로
// 렌더 안함 (텍스트 "미설정" 으로 보이는 것보다 공간 절약하는 편이 낫다).
export default function LanguageBadge({ locale, size = 'xs' }: Props) {
  if (!locale) return null
  const label = LOCALE_LABELS[locale]
  const classes =
    size === 'xs'
      ? 'px-1.5 py-0.5 text-[10px]'
      : 'px-2 py-0.5 text-xs'
  return (
    <span
      className={`inline-flex items-center bg-gray-800 border border-gray-700 text-gray-300 font-semibold rounded ${classes}`}
      title={label}
    >
      {label}
    </span>
  )
}
