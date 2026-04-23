'use client'

// 상점 할인율 설정. 포인트와 실버는 1:1 동일 개념이므로 환율 개념이 아니라
// "할인율 (discount rate)" 로 해석 — 수동/자동 가격(모두 실버) 에 이 값을 곱해
// 최종 노출 포인트를 계산한다. 값 1 이면 할인 없음, 0.5 면 50% 할인.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Save, Percent } from 'lucide-react'
import { updateAppSetting } from '@/app/actions/settings'

interface Props {
  initial: string
}

const DISCOUNT_MIN = 0.01
const DISCOUNT_MAX = 1

export default function ShopSilverRateForm({ initial }: Props) {
  const tCommon = useTranslations('common')
  const router = useRouter()
  const [value, setValue] = useState(initial)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const dirty = value.trim() !== initial.trim()
  const parsed = Number(value)
  const percentPreview =
    Number.isFinite(parsed) && parsed > 0 && parsed <= 1
      ? `${Math.round((1 - parsed) * 100)}% 할인 · 1M실버 → ${Math.ceil(1_000_000 * parsed).toLocaleString()}p`
      : '유효 범위: 0.01 ~ 1'

  const handleSave = () => {
    setError('')
    setSaved(false)
    startTransition(async () => {
      const result = await updateAppSetting('shop_discount_rate', value.trim())
      if (result.error) {
        setError(result.error)
        return
      }
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Percent size={16} className="text-amber-400" />
        <h2 className="font-bold text-white">상점 할인율</h2>
      </div>
      <p className="text-gray-500 text-xs leading-relaxed">
        수동 가격과 자동 가격(AODP 실버 시세) 에 모두 곱해지는 할인율입니다.
        포인트와 실버는 1:1 동일 개념이라, <code className="text-gray-400">최종 포인트 = 실버 × 할인율</code>.
        범위 <code className="text-gray-400">(0, 1]</code>. 1 이면 할인 없음, 0.5 면 50% 할인.
      </p>
      <div className="flex items-center gap-2">
        <span className="text-gray-500 text-xs">할인율</span>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setSaved(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave()
          }}
          placeholder="0.5"
          className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white text-right font-mono focus:outline-none focus:border-amber-500"
          disabled={pending}
        />
        <span className="text-[11px] text-gray-500 font-mono">
          {percentPreview}
        </span>
        <button
          type="button"
          onClick={handleSave}
          disabled={
            pending ||
            !dirty ||
            !Number.isFinite(parsed) ||
            parsed < DISCOUNT_MIN ||
            parsed > DISCOUNT_MAX
          }
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
