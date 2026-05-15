'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { EyeOff, Loader2 } from 'lucide-react'
import { updateAppSetting } from '@/app/actions/settings'
import type { AppSettingKey } from '@/lib/app-settings'
import { useConfirm } from '@/components/ConfirmDialog'

interface Props {
  enabled: boolean
  settingKey: AppSettingKey
  size?: 'sm' | 'md'
}

// 공개 길드 페이지 카드 우측 상단에 떠 있는 어드민용 "이 섹션 숨기기" 버튼.
// 클릭 시 setting='false' 로 즉시 저장 → router.refresh 로 카드 사라짐.
// 다시 켜려면 어드민 프로필 페이지의 "숨겨진 섹션" 영역에서 복원.
export default function SectionVisibilityPin({
  enabled,
  settingKey,
  size = 'md',
}: Props) {
  const t = useTranslations('publicGuildProfile')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const askConfirm = useConfirm()

  if (!enabled) return null

  const onClick = async () => {
    const ok = await askConfirm({ body: t('hideSectionConfirm'), destructive: true })
    if (!ok) return
    startTransition(async () => {
      const result = await updateAppSetting(settingKey, 'false')
      if (result.error) {
        alert(result.error)
        return
      }
      router.refresh()
    })
  }

  const dim = size === 'sm' ? 'w-6 h-6' : 'w-7 h-7'
  const icon = size === 'sm' ? 11 : 12

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={`absolute top-2 right-2 z-10 inline-flex items-center justify-center ${dim} rounded-md bg-gray-900/90 text-amber-300 ring-1 ring-amber-500/40 opacity-0 group-hover:opacity-100 transition-opacity shadow disabled:opacity-50`}
      title={t('hideSectionTitle')}
      aria-label={t('hideSectionTitle')}
    >
      {pending ? (
        <Loader2 size={icon} className="animate-spin" />
      ) : (
        <EyeOff size={icon} />
      )}
    </button>
  )
}
