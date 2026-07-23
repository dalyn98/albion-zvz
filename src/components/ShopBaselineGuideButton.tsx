'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArrowRight, CheckCircle2, Shield, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useBodyScrollLock } from './useBodyScrollLock'

const BASELINE_HREF = '/admin/dashboard/shop/baseline'
const GUIDE_STEP_KEYS = [
  'baselineGuideStep1',
  'baselineGuideStep2',
  'baselineGuideStep3',
  'baselineGuideStep4',
  'baselineGuideStep5',
] as const

export default function ShopBaselineGuideButton() {
  const [open, setOpen] = useState(false)
  const [navigating, setNavigating] = useState(false)
  const router = useRouter()
  const t = useTranslations('adminShopPage')
  const tCommon = useTranslations('common')
  useBodyScrollLock(open)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  const continueToBaseline = () => {
    setNavigating(true)
    router.push(BASELINE_HREF)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-200 hover:bg-amber-500/20"
      >
        <Shield size={14} />
        {t('baselineLink')}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto overscroll-contain bg-black/70 p-4"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="shop-baseline-guide-title"
            aria-describedby="shop-baseline-guide-description"
            className="my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-amber-500/40 bg-gray-950 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3 px-5 pt-5">
              <div className="mt-0.5 rounded-full bg-amber-500/15 p-2 text-amber-300">
                <Shield size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="shop-baseline-guide-title" className="text-lg font-bold text-white">
                  {t('baselineGuideTitle')}
                </h2>
                <p
                  id="shop-baseline-guide-description"
                  className="mt-1.5 text-sm leading-relaxed text-gray-300"
                >
                  {t('baselineGuideIntro')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="-mr-1 -mt-1 rounded-md p-1 text-gray-500 hover:text-white"
                aria-label={tCommon('close')}
              >
                <X size={16} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
              <ol className="space-y-2.5">
                {GUIDE_STEP_KEYS.map((key, index) => (
                  <li key={key} className="flex gap-3 text-sm leading-relaxed text-gray-200">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-xs font-bold text-amber-200">
                      {index + 1}
                    </span>
                    <span>{t(key)}</span>
                  </li>
                ))}
              </ol>

              <div className="mt-4 flex gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-rose-300" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-rose-100">
                    {t('baselineGuideWarningTitle')}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-rose-100/80">
                    {t('baselineGuideWarningBody')}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-gray-800 px-5 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2 text-sm text-gray-300 hover:text-white"
              >
                {tCommon('cancel')}
              </button>
              <button
                type="button"
                onClick={continueToBaseline}
                disabled={navigating}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/20 px-3 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-500/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <CheckCircle2 size={15} />
                {t('baselineGuideConfirm')}
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
