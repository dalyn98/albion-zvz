'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Save, Coins } from 'lucide-react'
import { updateAppSetting } from '@/app/actions/settings'

interface Props {
  initial: string
}

export default function ShopSilverRateForm({ initial }: Props) {
  const tCommon = useTranslations('common')
  const router = useRouter()
  const [value, setValue] = useState(initial)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const dirty = value.trim() !== initial.trim()

  const handleSave = () => {
    setError('')
    setSaved(false)
    startTransition(async () => {
      const result = await updateAppSetting('shop_silver_to_point_rate', value.trim())
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
        <Coins size={16} className="text-amber-400" />
        <h2 className="font-bold text-white">실버 → 포인트 환율</h2>
      </div>
      <p className="text-gray-500 text-xs">
        AODP 에서 받은 실버 시세를 이 값으로 나눠 포인트 가격으로 환산합니다. 1 이면 실버와 포인트가
        1:1. 값이 커질수록 동일 시세 기준 포인트 가격이 낮아집니다. 수동으로 지정한 가격(<code className="text-gray-400">manual_price</code>)이 있으면 이 환율을 무시합니다.
      </p>
      <div className="flex items-center gap-2">
        <span className="text-gray-500 text-xs">1 포인트 =</span>
        <input
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setSaved(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave()
          }}
          className="w-28 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white text-right font-mono focus:outline-none focus:border-amber-500"
          disabled={pending}
        />
        <span className="text-gray-500 text-xs">실버</span>
        <button
          type="button"
          onClick={handleSave}
          disabled={pending || !dirty}
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
