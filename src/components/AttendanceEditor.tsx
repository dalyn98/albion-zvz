'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Check, UserCheck, UserX } from 'lucide-react'
import type { PartyWithSlots, Slot } from '@/types'
import { bulkSetAttendance, toggleSlotAttendance } from '@/app/actions/admin'
import { formatDateTimeShort } from '@/lib/format-datetime'
import MemberAvatar from './MemberAvatar'
import { useToast } from './ToastProvider'

interface Props {
  eventId: string
  parties: PartyWithSlots[]
  avatars: Record<string, string | null>
}

interface RowData {
  slot: Slot
  partyNumber: number
}

export default function AttendanceEditor({ eventId, parties, avatars }: Props) {
  const router = useRouter()
  const t = useTranslations('adminAttendance')
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [busySlotId, setBusySlotId] = useState<string | null>(null)

  const rows = useMemo<RowData[]>(() => {
    const out: RowData[] = []
    for (const party of parties) {
      for (const slot of party.slots) {
        if (!slot.assigned_discord_id) continue
        out.push({ slot, partyNumber: party.party_number })
      }
    }
    return out.sort((a, b) =>
      a.partyNumber !== b.partyNumber
        ? a.partyNumber - b.partyNumber
        : a.slot.slot_number - b.slot.slot_number,
    )
  }, [parties])

  const attendedCount = rows.filter((r) => r.slot.attended_at).length

  const handleToggle = (slotId: string, nextAttended: boolean) => {
    setBusySlotId(slotId)
    startTransition(async () => {
      const result = await toggleSlotAttendance(slotId, nextAttended)
      setBusySlotId(null)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(nextAttended ? t('toastMarked') : t('toastUnmarked'))
      router.refresh()
    })
  }

  const handleBulk = (attended: boolean) => {
    const confirmMsg = attended ? t('confirmMarkAll') : t('confirmClearAll')
    if (!confirm(confirmMsg)) return
    startTransition(async () => {
      const result = await bulkSetAttendance(eventId, attended)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(t('toastBulk', { count: result.affected ?? 0 }))
      router.refresh()
    })
  }

  return (
    <section className="space-y-3 sm:space-y-4 bg-gray-900/40 border border-gray-800 rounded-2xl p-4 sm:p-5">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-white">{t('sectionTitle')}</h2>
          <p className="text-gray-400 text-xs sm:text-sm mt-1">{t('description')}</p>
        </div>
        {rows.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400 font-mono">
              {t('summary', { attended: attendedCount, total: rows.length })}
            </span>
            <button
              type="button"
              onClick={() => handleBulk(true)}
              disabled={pending}
              className="inline-flex items-center gap-1 text-xs font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 px-2.5 py-1 rounded disabled:opacity-50"
            >
              <UserCheck size={12} />
              {t('markAll')}
            </button>
            <button
              type="button"
              onClick={() => handleBulk(false)}
              disabled={pending}
              className="inline-flex items-center gap-1 text-xs font-semibold bg-gray-700/60 hover:bg-gray-700 border border-gray-600 text-gray-300 px-2.5 py-1 rounded disabled:opacity-50"
            >
              <UserX size={12} />
              {t('clearAll')}
            </button>
          </div>
        )}
      </header>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500 py-4 text-center">{t('empty')}</p>
      ) : (
        <ul className="divide-y divide-gray-800 border border-gray-800 rounded-lg overflow-hidden">
          {rows.map(({ slot, partyNumber }) => {
            const attended = !!slot.attended_at
            const busy = busySlotId === slot.id
            return (
              <li
                key={slot.id}
                className={`flex items-center gap-3 px-3 py-2 ${
                  attended ? 'bg-emerald-500/5' : 'bg-transparent'
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleToggle(slot.id, !attended)}
                  disabled={pending}
                  aria-pressed={attended}
                  className={`flex items-center justify-center w-6 h-6 rounded border-2 flex-shrink-0 transition-colors ${
                    attended
                      ? 'bg-emerald-500 border-emerald-500 text-black'
                      : 'border-gray-600 hover:border-emerald-400'
                  } ${busy ? 'opacity-50' : ''}`}
                >
                  {attended && <Check size={14} strokeWidth={3} />}
                </button>
                <MemberAvatar
                  discordId={slot.assigned_discord_id!}
                  avatar={avatars[slot.assigned_discord_id!] ?? null}
                  size={24}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-semibold truncate">
                    {slot.assigned_username ?? slot.assigned_discord_id}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap text-[11px] text-gray-400">
                    <span>{t('party', { number: partyNumber })}</span>
                    <span className="text-gray-600">·</span>
                    <span>{t('slotLabel', { slot: slot.slot_number })}</span>
                    {slot.role_name && (
                      <>
                        <span className="text-gray-600">·</span>
                        <span className="text-amber-300">{slot.role_name}</span>
                      </>
                    )}
                    {attended && slot.attended_at && (
                      <span className="text-emerald-400 font-mono">
                        {t('attendedAt', { datetime: formatDateTimeShort(slot.attended_at) })}
                      </span>
                    )}
                  </div>
                </div>
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded flex-shrink-0 ${
                    attended
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-gray-700/60 text-gray-400'
                  }`}
                >
                  {attended ? t('attended') : t('noShow')}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
