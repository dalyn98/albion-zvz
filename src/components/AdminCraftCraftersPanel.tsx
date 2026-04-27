'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { UserPlus, UserMinus, Users } from 'lucide-react'
import {
  setMemberCrafterFlag,
  type CraftCompensationMode,
} from '@/app/actions/craft'
import { useToast } from './ToastProvider'

interface AdminCrafterRow {
  discordId: string
  username: string
  isCrafter: boolean
  compensationMode: CraftCompensationMode
  premiumPct: number
}

interface MemberOption {
  discordId: string
  username: string
}

interface Props {
  initialCrafters: AdminCrafterRow[]
  memberOptions: MemberOption[]
}

// 길드 제작자 권한 부여/회수. 좌측엔 현재 제작자 목록 + "회수" 버튼, 우측엔
// is_crafter 가 아닌 일반 멤버 검색 후 "지정" 버튼. 변경 즉시 router.refresh.
export default function AdminCraftCraftersPanel({ initialCrafters, memberOptions }: Props) {
  const t = useTranslations('adminCraft')
  const toast = useToast()
  const router = useRouter()
  const [pendingTarget, setPendingTarget] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const [search, setSearch] = useState('')

  const crafterIds = useMemo(
    () => new Set(initialCrafters.map((c) => c.discordId)),
    [initialCrafters],
  )

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase()
    return memberOptions
      .filter((m) => !crafterIds.has(m.discordId))
      .filter((m) => (q ? m.username.toLowerCase().includes(q) : true))
      .slice(0, 8)
  }, [memberOptions, crafterIds, search])

  const toggle = (discordId: string, next: boolean) => {
    setPendingTarget(discordId)
    startTransition(async () => {
      const r = await setMemberCrafterFlag(discordId, next)
      setPendingTarget(null)
      if (r.error) {
        toast.error(r.error)
        return
      }
      toast.success(next ? t('toastCrafterAdded') : t('toastCrafterRemoved'))
      router.refresh()
    })
  }

  return (
    <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-4">
      <div>
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Users size={16} className="text-amber-400" />
          {t('craftersTitle')}
        </h2>
        <p className="text-xs text-gray-500 mt-1">{t('craftersHint')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-2">
          <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">
            {t('craftersListTitle', { count: initialCrafters.length })}
          </p>
          {initialCrafters.length === 0 ? (
            <p className="text-gray-500 text-sm bg-gray-950 border border-gray-800 rounded-lg px-3 py-4 text-center">
              {t('craftersEmpty')}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {initialCrafters.map((c) => {
                const isPending = pendingTarget === c.discordId
                return (
                  <li
                    key={c.discordId}
                    className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white font-medium truncate">{c.username}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        {c.compensationMode === 'paid'
                          ? t('crafterModePaid', { premium: c.premiumPct })
                          : t('crafterModeVolunteer')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggle(c.discordId, false)}
                      disabled={isPending}
                      className="flex-shrink-0 text-[11px] text-rose-300 hover:text-rose-200 border border-rose-500/30 hover:border-rose-500/60 rounded px-2 py-1 inline-flex items-center gap-1 disabled:opacity-50"
                    >
                      <UserMinus size={11} />
                      {isPending ? t('processing') : t('removeCrafter')}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">
            {t('addCrafterTitle')}
          </p>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('addCrafterSearchPlaceholder')}
            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
          />
          {candidates.length === 0 ? (
            <p className="text-gray-500 text-xs px-1">{t('addCrafterNoMatch')}</p>
          ) : (
            <ul className="space-y-1.5">
              {candidates.map((m) => {
                const isPending = pendingTarget === m.discordId
                return (
                  <li
                    key={m.discordId}
                    className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 flex items-center justify-between gap-2"
                  >
                    <p className="text-sm text-white font-medium truncate min-w-0 flex-1">
                      {m.username}
                    </p>
                    <button
                      type="button"
                      onClick={() => toggle(m.discordId, true)}
                      disabled={isPending}
                      className="flex-shrink-0 text-[11px] font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black rounded px-2 py-1 inline-flex items-center gap-1"
                    >
                      <UserPlus size={11} />
                      {isPending ? t('processing') : t('addCrafter')}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
