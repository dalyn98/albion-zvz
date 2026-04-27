'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Box, ListChecks, X, Coins } from 'lucide-react'
import {
  cancelCraftTaskAdmin,
  convertCraftTaskToSilverAdmin,
  type CraftQueueItem,
} from '@/app/actions/craft'
import { SLOT_KEYS, type SlotKey } from '@/types'
import { formatSilver } from '@/lib/silver'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import ItemImage from './ItemImage'
import { useToast } from './ToastProvider'

interface Props {
  initialTasks: CraftQueueItem[]
}

// 진행 중 (queued/claimed/delivered) 작업 + 강제 취소 / 실버 변환 버튼.
// 실버 변환은 RPC 가 craft_tasks 취소 + regear_requests 모드 전환 + ledger insert
// 를 atomic 하게 처리하므로 부분 실패가 발생하지 않는다.
export default function AdminCraftTasksList({ initialTasks }: Props) {
  const t = useTranslations('adminCraft')
  const tRole = useTranslations('slotRole')
  const toast = useToast()
  const router = useRouter()
  const [pendingTarget, setPendingTarget] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const onCancel = (taskId: string) => {
    if (!window.confirm(t('confirmCancelTask'))) return
    setPendingTarget(taskId)
    startTransition(async () => {
      const r = await cancelCraftTaskAdmin(taskId)
      setPendingTarget(null)
      if (r.error) {
        toast.error(r.error)
        return
      }
      toast.success(t('toastTaskCancelled'))
      router.refresh()
    })
  }

  const onConvert = (taskId: string) => {
    if (!window.confirm(t('confirmConvertTask'))) return
    setPendingTarget(taskId)
    startTransition(async () => {
      const r = await convertCraftTaskToSilverAdmin(taskId)
      setPendingTarget(null)
      if (r.error) {
        toast.error(r.error)
        return
      }
      toast.success(t('toastTaskConverted'))
      router.refresh()
    })
  }

  return (
    <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-3">
      <div>
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <ListChecks size={16} className="text-amber-400" />
          {t('tasksTitle')}
          <span className="text-xs text-gray-500">({initialTasks.length})</span>
        </h2>
        <p className="text-xs text-gray-500 mt-1">{t('tasksHint')}</p>
      </div>
      {initialTasks.length === 0 ? (
        <p className="text-gray-500 text-sm bg-gray-950 border border-gray-800 rounded-lg px-3 py-6 text-center">
          {t('tasksEmpty')}
        </p>
      ) : (
        <ul className="space-y-2">
          {initialTasks.map((task) => {
            const isPending = pendingTarget === task.taskId
            const canCancelOrConvert = task.status === 'queued' || task.status === 'claimed'
            return (
              <li
                key={task.taskId}
                className="bg-gray-950 border border-gray-800 rounded-lg p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white font-semibold truncate">{task.eventTitle}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {t('taskRequester', { name: task.requesterUsername })}
                      <span className="ml-2 text-gray-500">
                        · {translateSlotRole(task.roleName, tRole)}
                      </span>
                      {task.claimedSilver != null && (
                        <span className="ml-2 text-amber-300 font-mono">
                          {formatSilver(task.claimedSilver)}
                        </span>
                      )}
                    </p>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${statusBadgeClass(task.status)}`}
                  >
                    {t(`status_${task.status}` as 'status_queued')}
                  </span>
                </div>

                {task.buildSnapshot && (
                  <div className="flex items-center gap-1.5 flex-wrap border-t border-gray-800 pt-2">
                    {SLOT_KEYS.map((key: SlotKey) => {
                      const item = task.buildSnapshot?.[key]
                      if (!item) return null
                      return (
                        <ItemImage
                          key={key}
                          itemId={item.id}
                          itemName={item.name}
                          size={28}
                          hoverPreview
                        />
                      )
                    })}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400">
                  {task.crafterUsername && (
                    <span>
                      <Box size={10} className="inline -mt-0.5 mr-0.5" />
                      {t('taskCrafter', { name: task.crafterUsername })}
                    </span>
                  )}
                  {task.boxNumber != null && (
                    <span className="font-mono text-emerald-300">#{task.boxNumber}</span>
                  )}
                  {task.craftCity && <span className="text-gray-500">· {task.craftCity}</span>}
                  {task.materialSilverCost != null && (
                    <span className="text-gray-500">
                      · {t('taskMaterial', { silver: formatSilver(task.materialSilverCost) })}
                    </span>
                  )}
                </div>

                {canCancelOrConvert && (
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => onConvert(task.taskId)}
                      disabled={isPending}
                      className="text-[11px] text-amber-300 hover:text-amber-200 border border-amber-500/30 hover:border-amber-500/60 rounded px-2 py-1 inline-flex items-center gap-1 disabled:opacity-50"
                    >
                      <Coins size={11} />
                      {t('convertToSilver')}
                    </button>
                    <button
                      type="button"
                      onClick={() => onCancel(task.taskId)}
                      disabled={isPending}
                      className="text-[11px] text-rose-300 hover:text-rose-200 border border-rose-500/30 hover:border-rose-500/60 rounded px-2 py-1 inline-flex items-center gap-1 disabled:opacity-50"
                    >
                      <X size={11} />
                      {isPending ? t('processing') : t('cancelTask')}
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function statusBadgeClass(status: CraftQueueItem['status']): string {
  switch (status) {
    case 'queued':
      return 'bg-gray-700/40 text-gray-300'
    case 'claimed':
      return 'bg-amber-500/20 text-amber-300'
    case 'delivered':
      return 'bg-emerald-500/20 text-emerald-300'
    case 'collected':
      return 'bg-blue-500/20 text-blue-300'
    case 'cancelled':
      return 'bg-rose-500/20 text-rose-300'
    case 'expired':
      return 'bg-orange-500/20 text-orange-300'
    default:
      return 'bg-gray-700/40 text-gray-300'
  }
}
