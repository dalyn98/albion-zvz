'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { UserPlus, UserMinus, Users, Box } from 'lucide-react'
import {
  setMemberCrafterFlag,
  setCrafterBoxRange,
  type CraftCompensationMode,
} from '@/app/actions/craft'
import { useToast } from './ToastProvider'

interface AdminCrafterRow {
  discordId: string
  username: string
  isCrafter: boolean
  compensationMode: CraftCompensationMode
  premiumPct: number
  boxRangeStart: number | null
  boxRangeEnd: number | null
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
                    className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
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
                    </div>
                    <BoxRangeEditor
                      discordId={c.discordId}
                      initialStart={c.boxRangeStart}
                      initialEnd={c.boxRangeEnd}
                    />
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

interface BoxRangeEditorProps {
  discordId: string
  initialStart: number | null
  initialEnd: number | null
}

// 크래프터 카드 안의 박스 범위 편집기. start/end 둘 다 비우면 "해제", 둘 다 적으면
// "할당". 한쪽만 비우는 건 invalidInput 으로 서버가 거부한다. 다른 크래프터와
// 겹치는 범위면 서버에서 craftBoxRangeOverlap 로 거부 → toast.
function BoxRangeEditor({ discordId, initialStart, initialEnd }: BoxRangeEditorProps) {
  const t = useTranslations('adminCraft')
  const toast = useToast()
  const router = useRouter()
  const [start, setStart] = useState(initialStart != null ? String(initialStart) : '')
  const [end, setEnd] = useState(initialEnd != null ? String(initialEnd) : '')
  const [pending, startTransition] = useTransition()

  const parseBoundary = (raw: string): number | null | 'invalid' => {
    const trimmed = raw.trim()
    if (!trimmed) return null
    const n = Number(trimmed)
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return 'invalid'
    return n
  }

  const save = () => {
    const s = parseBoundary(start)
    const e = parseBoundary(end)
    if (s === 'invalid' || e === 'invalid') {
      toast.error(t('boxRangeInvalid'))
      return
    }
    if ((s == null) !== (e == null)) {
      toast.error(t('boxRangeBothOrNone'))
      return
    }
    if (s != null && e != null && s > e) {
      toast.error(t('boxRangeStartGtEnd'))
      return
    }
    startTransition(async () => {
      const r = await setCrafterBoxRange(discordId, s, e)
      if (r.error) {
        toast.error(r.error)
        return
      }
      toast.success(t('boxRangeSaved'))
      router.refresh()
    })
  }

  const clear = () => {
    setStart('')
    setEnd('')
    startTransition(async () => {
      const r = await setCrafterBoxRange(discordId, null, null)
      if (r.error) {
        toast.error(r.error)
        return
      }
      toast.success(t('boxRangeCleared'))
      router.refresh()
    })
  }

  return (
    <div className="border-t border-gray-800 pt-2 space-y-1.5">
      <p className="text-[10px] text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
        <Box size={10} className="text-emerald-400" />
        {t('boxRangeTitle')}
      </p>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          inputMode="numeric"
          min={1}
          value={start}
          onChange={(ev) => setStart(ev.target.value)}
          disabled={pending}
          placeholder={t('boxRangeStartPlaceholder')}
          className="w-16 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
        />
        <span className="text-gray-600 text-xs">~</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          value={end}
          onChange={(ev) => setEnd(ev.target.value)}
          disabled={pending}
          placeholder={t('boxRangeEndPlaceholder')}
          className="w-16 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
        />
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="text-[10px] font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black rounded px-2 py-1"
        >
          {pending ? t('processing') : t('boxRangeSave')}
        </button>
        {(initialStart != null || initialEnd != null) && (
          <button
            type="button"
            onClick={clear}
            disabled={pending}
            className="text-[10px] text-gray-400 hover:text-white border border-gray-700 hover:border-rose-500/40 rounded px-2 py-1 disabled:opacity-50"
          >
            {t('boxRangeClear')}
          </button>
        )}
      </div>
      {initialStart == null && initialEnd == null && (
        <p className="text-[10px] text-gray-500">{t('boxRangeUnassignedHint')}</p>
      )}
    </div>
  )
}
