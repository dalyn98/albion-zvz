'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useLocale, useTranslations } from 'next-intl'
import { History, Trash2 } from 'lucide-react'
import {
  loadRecentBuilds,
  removeRecentBuild,
  getBuildWeaponSample,
  type RecentBuild,
} from '@/lib/recent-builds'
import { getLocalizedItemName } from '@/lib/item-names'
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales'
import { applyTemplateToSlotInput } from '@/lib/slot-template-shape'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import type { SlotInput } from './SlotEditor'

interface Props {
  slot: SlotInput
  onLoad: (next: SlotInput) => void
}

export default function RecentBuildsDropdown({ slot, onLoad }: Props) {
  const t = useTranslations('adminTemplates')
  const tRole = useTranslations('slotRole')
  const rawLocale = useLocale()
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE
  const [open, setOpen] = useState(false)
  const [builds, setBuilds] = useState<RecentBuild[]>([])
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  // Refresh the list every time the popover opens so the newest build saved
  // from the Done click appears immediately.
  useEffect(() => {
    if (!open) return
    // 드롭다운 열림 → localStorage 에서 최신 build 목록 fetch. open → state 동기화.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBuilds(loadRecentBuilds())
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null
      if (!target) return
      if (wrapperRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const apply = (build: RecentBuild) => {
    const next = applyTemplateToSlotInput(slot, build.data)
    onLoad(next)
    setOpen(false)
  }

  const remove = (id: string) => {
    setBuilds(removeRecentBuild(id))
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1 text-[11px] font-medium text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-md px-2 py-1 transition-colors"
        title={t('recentBuildsTooltip')}
        aria-expanded={open}
      >
        <History size={11} />
        {t('recentBuildsBtn')}
      </button>

      {open && (
        <div className="absolute z-[55] mt-1 left-0 w-72 sm:w-80 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between">
            <span className="text-white text-xs font-semibold">{t('recentBuildsTitle')}</span>
            <span className="text-gray-500 text-[10px]">{t('recentBuildsLimit')}</span>
          </div>
          <ul className="max-h-[50vh] overflow-y-auto divide-y divide-gray-800">
            {builds.length === 0 ? (
              <li className="px-3 py-4 text-center text-gray-500 text-xs">
                {t('recentBuildsEmpty')}
              </li>
            ) : (
              builds.map((b) => {
                const sample = getBuildWeaponSample(b.data)
                const displayName =
                  getLocalizedItemName(sample.id, locale, sample.name) ??
                  (b.data.role_name ? translateSlotRole(b.data.role_name, tRole) : null) ??
                  t('recentBuildsFallbackName')
                return (
                  <li key={b.id} className="flex items-center gap-2 px-2 py-2 hover:bg-gray-800/60">
                    <button
                      type="button"
                      onClick={() => apply(b)}
                      className="flex items-center gap-2 flex-1 min-w-0 text-left"
                    >
                      <div className="w-10 h-10 flex-shrink-0 rounded-md bg-black/40 border border-gray-800 overflow-hidden relative">
                        {sample.id ? (
                          <Image
                            src={`https://render.albiononline.com/v1/item/${sample.id}.png`}
                            alt=""
                            fill
                            className="object-contain pixel-img"
                            unoptimized
                          />
                        ) : (
                          <span className="absolute inset-0 flex items-center justify-center text-gray-600 text-[10px]">—</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-white text-xs font-semibold truncate">{displayName}</p>
                        <p className="text-gray-500 text-[10px] truncate">
                          {b.data.role_name ? translateSlotRole(b.data.role_name, tRole) : t('recentBuildsNoRole')}
                        </p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(b.id)}
                      className="p-1.5 text-gray-600 hover:text-red-400 flex-shrink-0"
                      aria-label={t('recentBuildsRemoveAria')}
                    >
                      <Trash2 size={12} />
                    </button>
                  </li>
                )
              })
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
