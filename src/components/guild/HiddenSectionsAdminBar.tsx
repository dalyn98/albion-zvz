'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Eye, Loader2 } from 'lucide-react'
import { updateAppSetting } from '@/app/actions/settings'
import type { AppSettingKey } from '@/lib/app-settings'
import { useToast } from '@/components/ToastProvider'

export interface HiddenSectionEntry {
  settingKey: AppSettingKey
  label: string
}

interface Props {
  enabled: boolean
  hiddenSections: HiddenSectionEntry[]
}

// 어드민 본인 길드 페이지 하단에 떠 있는 "숨겨진 섹션 다시 보이기" 위젯.
// 인라인 핀으로 끈 섹션을 다시 켤 수 있는 단일 진입점. 어드민 외 일반
// 방문자에겐 렌더되지 않는다 (enabled=false 면 null).
export default function HiddenSectionsAdminBar({ enabled, hiddenSections }: Props) {
  const t = useTranslations('publicGuildProfile')
  const router = useRouter()
  const [pendingKey, setPendingKey] = useState<AppSettingKey | null>(null)
  const [, startTransition] = useTransition()
  const toast = useToast()

  if (!enabled || hiddenSections.length === 0) return null

  const onShow = (key: AppSettingKey) => {
    setPendingKey(key)
    startTransition(async () => {
      const result = await updateAppSetting(key, 'true')
      setPendingKey(null)
      if (result.error) {
        toast.error(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 space-y-2">
      <p className="text-amber-200 text-xs font-bold flex items-center gap-1.5">
        <Eye size={12} />
        {t('hiddenSectionsTitle')}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {hiddenSections.map((entry) => {
          const isPending = pendingKey === entry.settingKey
          return (
            <button
              key={entry.settingKey}
              type="button"
              onClick={() => onShow(entry.settingKey)}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold text-gray-300 hover:text-amber-200 ring-1 ring-gray-700 hover:ring-amber-500/40 bg-gray-900/40 transition-colors disabled:opacity-50"
            >
              {isPending ? <Loader2 size={10} className="animate-spin" /> : <Eye size={10} />}
              <span>{entry.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
