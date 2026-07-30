'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Save } from 'lucide-react'
import { type CraftBoxConfig } from '@/app/actions/craft'
import { updateCraftSettingsAdmin } from '@/app/actions/craft-admin'
import { useToast } from './ToastProvider'
import { useReportDirty } from './UnsavedChangesProvider'

interface Props {
  initial: CraftBoxConfig
}

// 제작 리기어의 보관함 번호 범위 + 작업 만료 일수. 지급 방식(실버/제작)은
// 리기어 설정에서 원자적으로 선택하므로 이 폼에서는 바꾸지 않는다.
export default function AdminCraftSettingsForm({ initial }: Props) {
  const t = useTranslations('adminCraft')
  const toast = useToast()
  const router = useRouter()
  const [includeCape, setIncludeCape] = useState(initial.includeCape)
  const [rangeMin, setRangeMin] = useState(String(initial.rangeMin))
  const [rangeMax, setRangeMax] = useState(String(initial.rangeMax))
  const [expiryDays, setExpiryDays] = useState(String(initial.expiryDays))
  // 저장 성공 시 saved* 를 새 값으로 sync — router.refresh 동안의 false-alarm 방지.
  const [savedIncludeCape, setSavedIncludeCape] = useState(initial.includeCape)
  const [savedRangeMin, setSavedRangeMin] = useState(String(initial.rangeMin))
  const [savedRangeMax, setSavedRangeMax] = useState(String(initial.rangeMax))
  const [savedExpiryDays, setSavedExpiryDays] = useState(String(initial.expiryDays))
  const [pending, startTransition] = useTransition()

  const dirty =
    includeCape !== savedIncludeCape ||
    rangeMin !== savedRangeMin ||
    rangeMax !== savedRangeMax ||
    expiryDays !== savedExpiryDays
  useReportDirty('admin-craft-settings', dirty)

  const submit = () => {
    const min = Number(rangeMin)
    const max = Number(rangeMax)
    const expiry = Number(expiryDays)
    if (
      !Number.isInteger(min) ||
      !Number.isInteger(max) ||
      min < 1 ||
      max < min ||
      max > 999
    ) {
      toast.error(t('errBoxRange'))
      return
    }
    if (!Number.isInteger(expiry) || expiry < 1 || expiry > 30) {
      toast.error(t('errExpiry'))
      return
    }
    startTransition(async () => {
      const r = await updateCraftSettingsAdmin({
        includeCape,
        rangeMin: min,
        rangeMax: max,
        expiryDays: expiry,
      })
      if (r.error) {
        toast.error(r.error)
        return
      }
      setSavedIncludeCape(includeCape)
      setSavedRangeMin(String(min))
      setSavedRangeMax(String(max))
      setSavedExpiryDays(String(expiry))
      toast.success(t('toastSaved'))
      router.refresh()
    })
  }

  return (
    <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-4">
      <div>
        <h2 className="text-base font-bold text-white">{t('settingsTitle')}</h2>
        <p className="text-xs text-gray-500 mt-1">{t('settingsHint')}</p>
      </div>

      <label className="flex items-center justify-between gap-2 bg-gray-950 border border-gray-700 rounded-lg px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-white font-semibold">{t('includeCapeLabel')}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">{t('includeCapeHint')}</p>
        </div>
        <input
          type="checkbox"
          checked={includeCape}
          onChange={(e) => setIncludeCape(e.target.checked)}
          disabled={pending}
          className="w-4 h-4"
        />
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] text-gray-400 mb-1">{t('rangeMinLabel')}</label>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={999}
            value={rangeMin}
            onChange={(e) => setRangeMin(e.target.value)}
            disabled={pending}
            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
          />
        </div>
        <div>
          <label className="block text-[11px] text-gray-400 mb-1">{t('rangeMaxLabel')}</label>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={999}
            value={rangeMax}
            onChange={(e) => setRangeMax(e.target.value)}
            disabled={pending}
            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
          />
        </div>
        <div>
          <label className="block text-[11px] text-gray-400 mb-1">{t('expiryDaysLabel')}</label>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={30}
            value={expiryDays}
            onChange={(e) => setExpiryDays(e.target.value)}
            disabled={pending}
            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
          />
          <p className="text-[10px] text-gray-500 mt-1">{t('expiryDaysHint')}</p>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="text-xs font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black rounded-lg px-4 py-2 inline-flex items-center gap-1.5"
        >
          <Save size={12} />
          {pending ? t('saving') : t('save')}
        </button>
      </div>
    </section>
  )
}
