'use client'

// 상점 할인율 설정. 어드민은 "할인 퍼센트(0~99)" 로 입력하지만 실제 저장 형식은
// multiplier (0.01~1, 1=할인없음). 어드민 멘탈모델("10% 할인") 과 가격 계산
// 모델(silver × multiplier) 사이의 변환을 폼이 흡수한다. 저장 시 percent →
// multiplier, 로드 시 multiplier → percent.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Save, Percent } from 'lucide-react'
import { updateAppSetting } from '@/app/actions/settings'
import { useReportDirty } from './UnsavedChangesProvider'

interface Props {
  initial: string
}

const PERCENT_MIN = 0
const PERCENT_MAX = 99

function multiplierToPercent(multiplier: string): number {
  const m = Number(multiplier)
  if (!Number.isFinite(m) || m <= 0 || m > 1) return 0
  return Math.max(PERCENT_MIN, Math.min(PERCENT_MAX, Math.round((1 - m) * 100)))
}

function percentToMultiplier(percent: number): string {
  // 0 → "1", 50 → "0.5", 99 → "0.01". toFixed(2) 후 Number 로 변환해
  // trailing zero 제거.
  return Number(((100 - percent) / 100).toFixed(2)).toString()
}

export default function ShopSilverRateForm({ initial }: Props) {
  const tCommon = useTranslations('common')
  const t = useTranslations('adminShopSilverRate')
  const router = useRouter()
  const initialPercent = multiplierToPercent(initial)
  const [percent, setPercent] = useState(String(initialPercent))
  const [savedPercent, setSavedPercent] = useState(String(initialPercent))
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const dirty = percent.trim() !== savedPercent
  useReportDirty('shop-silver-rate', dirty)
  const parsed = Number(percent)
  const isValid =
    Number.isFinite(parsed) &&
    Number.isInteger(parsed) &&
    parsed >= PERCENT_MIN &&
    parsed <= PERCENT_MAX
  const previewText = isValid
    ? t('percentPreview', {
        percent: parsed,
        points: Math.ceil((1_000_000 * (100 - parsed)) / 100).toLocaleString(),
      })
    : t('rangeHint')

  const handleSave = () => {
    setError('')
    setSaved(false)
    startTransition(async () => {
      const multiplier = percentToMultiplier(parsed)
      const result = await updateAppSetting('shop_discount_rate', multiplier)
      if (result.error) {
        setError(result.error)
        return
      }
      setSavedPercent(String(parsed))
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Percent size={16} className="text-amber-400" />
        <h2 className="font-bold text-white">{t('title')}</h2>
      </div>
      <p className="whitespace-pre-line text-gray-500 text-xs leading-relaxed">
        {t('description')}
      </p>
      <div className="flex items-center gap-2">
        <span className="text-gray-500 text-xs">{t('rateLabel')}</span>
        <div className="relative">
          <input
            type="text"
            inputMode="numeric"
            value={percent}
            onChange={(e) => {
              setPercent(e.target.value)
              setSaved(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave()
            }}
            placeholder="10"
            className="w-24 bg-gray-800 border border-gray-700 rounded-lg pl-3 pr-7 py-2 text-sm text-white text-right font-mono focus:outline-none focus:border-amber-500"
            disabled={pending}
          />
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">
            %
          </span>
        </div>
        <span className="text-[11px] text-gray-500 font-mono">{previewText}</span>
        <button
          type="button"
          onClick={handleSave}
          disabled={pending || !dirty || !isValid}
          className="ml-auto flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-3 py-2 rounded-lg transition-colors text-sm"
        >
          <Save size={12} />
          {pending ? tCommon('saving') : tCommon('save')}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {saved && !dirty && <p className="text-xs text-emerald-400">{tCommon('saved')}</p>}
    </div>
  )
}
