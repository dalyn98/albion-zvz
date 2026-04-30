'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Box, ListChecks, X, Coins, ChevronDown, Undo2 } from 'lucide-react'
import {
  cancelCraftTaskAdmin,
  convertCraftTaskToSilverAdmin,
  revertCraftTaskToPendingAdmin,
  type CraftQueueItem,
} from '@/app/actions/craft'
import { SLOT_KEYS, type SlotKey } from '@/types'
import { formatSilver } from '@/lib/silver'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import {
  groupByEvent,
  formatGatherTime,
  NO_EVENT_KEY,
  type EventGroup,
} from '@/lib/craft-grouping'
import ItemImage from './ItemImage'
import { useToast } from './ToastProvider'

interface Props {
  initialTasks: CraftQueueItem[]
}

// 진행 중 (queued/claimed/delivered) 작업 + 강제 취소 / 실버 변환 버튼.
// 멤버용 큐 클라이언트와 동일하게 이벤트별로 그룹화해서 어드민이 한 이벤트의
// 청구 묶음을 한눈에 볼 수 있게 한다. event_id 가 null 인 청구(트래킹 사망 직접
// 신청 또는 이벤트 삭제됨) 는 맨 뒤 "이벤트 미연결" 그룹으로 분리.
export default function AdminCraftTasksList({ initialTasks }: Props) {
  const t = useTranslations('adminCraft')
  const tRole = useTranslations('slotRole')
  const toast = useToast()
  const router = useRouter()
  const [pendingTarget, setPendingTarget] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const groups = useMemo(() => groupByEvent(initialTasks), [initialTasks])

  const toggleGroupCollapsed = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

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

  const onRevert = (taskId: string) => {
    if (!window.confirm(t('confirmRevertTask'))) return
    setPendingTarget(taskId)
    startTransition(async () => {
      const r = await revertCraftTaskToPendingAdmin(taskId)
      setPendingTarget(null)
      if (r.error) {
        toast.error(r.error)
        return
      }
      toast.success(t('toastTaskReverted'))
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
        <ul className="space-y-3">
          {groups.map((group) => (
            <GroupSection
              key={group.key}
              group={group}
              collapsed={collapsedGroups.has(group.key)}
              onToggle={() => toggleGroupCollapsed(group.key)}
              pendingTarget={pendingTarget}
              onCancel={onCancel}
              onConvert={onConvert}
              onRevert={onRevert}
              tRole={tRole}
              t={t}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

interface GroupSectionProps {
  group: EventGroup
  collapsed: boolean
  onToggle: () => void
  pendingTarget: string | null
  onCancel: (id: string) => void
  onConvert: (id: string) => void
  onRevert: (id: string) => void
  tRole: ReturnType<typeof useTranslations>
  t: ReturnType<typeof useTranslations>
}

function GroupSection({
  group,
  collapsed,
  onToggle,
  pendingTarget,
  onCancel,
  onConvert,
  onRevert,
  tRole,
  t,
}: GroupSectionProps) {
  const isNoEvent = group.key === NO_EVENT_KEY
  const title = isNoEvent ? t('groupNoEvent') : group.eventTitle
  const subtitle = group.gatherAt
    ? t('groupGatherAt', { time: formatGatherTime(group.gatherAt) })
    : null

  return (
    <li
      className={`rounded-xl border ${isNoEvent ? 'border-amber-700/40 bg-amber-950/10' : 'border-gray-800 bg-gray-950/50'} overflow-hidden`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-900/50 transition-colors text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white truncate">{title}</p>
          <p className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-2 flex-wrap">
            {subtitle && <span>{subtitle}</span>}
            {subtitle && <span className="text-gray-600">·</span>}
            <span>{t('groupTaskCount', { count: group.items.length })}</span>
            {group.totalClaimedSilver > 0 && (
              <>
                <span className="text-gray-600">·</span>
                <span className="text-amber-300 font-mono">
                  {formatSilver(group.totalClaimedSilver)}
                </span>
              </>
            )}
          </p>
          {isNoEvent && (
            <p className="text-[10px] text-amber-300/70 mt-1">{t('groupNoEventHint')}</p>
          )}
        </div>
        <ChevronDown
          size={18}
          className={`text-gray-400 flex-shrink-0 transition-transform ${collapsed ? '' : 'rotate-180'}`}
        />
      </button>

      {!collapsed && (
        <ul className="border-t border-gray-800 divide-y divide-gray-800">
          {group.items.map((task) => {
            const isPending = pendingTarget === task.taskId
            const canCancelOrConvert =
              task.status === 'queued' || task.status === 'claimed'
            return (
              <li key={task.taskId} className="bg-gray-950 p-3 space-y-2">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-gray-400">
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
                      onClick={() => onRevert(task.taskId)}
                      disabled={isPending}
                      className="text-[11px] text-sky-300 hover:text-sky-200 border border-sky-500/30 hover:border-sky-500/60 rounded px-2 py-1 inline-flex items-center gap-1 disabled:opacity-50"
                      title={t('revertTaskTitle')}
                    >
                      <Undo2 size={11} />
                      {t('revertTask')}
                    </button>
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
    </li>
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
