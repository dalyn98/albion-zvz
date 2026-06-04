'use client'

// 상점 환율/할인율 설정. 어드민은 "실버 가격에 적용할 비율(1~100%)" 로 입력하고,
// 실제 저장 형식은 multiplier (0.01~1) 다. 100% = 1:1, 50% = 절반 가격.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Save, Percent } from 'lucide-react'
import { updateAppSetting } from '@/app/actions/settings'
import {
  SHOP_RATE_PERCENT_MAX,
  SHOP_RATE_PERCENT_MIN,
  shopDiscountRateToPercent,
  shopRatePercentToDiscountRate,
} from '@/lib/shop/price'
import { useReportDirty } from './UnsavedChangesProvider'

interface Props {
  initial: string
}

export default function ShopSilverRateForm({ initial }: Props) {
  const tCommon = useTranslations('common')
  const t = useTranslations('adminShopSilverRate')
  const router = useRouter()
  const initialPercent = shopDiscountRateToPercent(initial)
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
    parsed >= SHOP_RATE_PERCENT_MIN &&
    parsed <= SHOP_RATE_PERCENT_MAX
  const previewText = isValid
    ? t('percentPreview', {
        percent: parsed,
        points: Math.ceil((1_000_000 * parsed) / 100).toLocaleString(),
      })
    : t('rangeHint')

  const handleSave = () => {
    setError('')
    setSaved(false)
    startTransition(async () => {
      const multiplier = shopRatePercentToDiscountRate(parsed)
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
            placeholder="100"
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
