'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  Ban,
  Box,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  Coins,
  ListChecks,
  Pencil,
  Undo2,
  X,
} from 'lucide-react'
import { type CraftQueueItem } from '@/app/actions/craft'
import {
  approveCraftReimbursementAdmin,
  approveCraftReimbursementAdjustedAdmin,
  bulkApproveCraftReimbursementsAdmin,
  cancelCraftTaskAdmin,
  convertCraftTaskToSilverAdmin,
  rejectCraftReimbursementAdmin,
  revertCraftTaskToPendingAdmin,
} from '@/app/actions/craft-admin'
import { formatSilver } from '@/lib/silver'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import {
  groupByEvent,
  formatGatherTime,
  NO_EVENT_KEY,
  type EventGroup,
} from '@/lib/craft-grouping'
import { getCraftSlotDisplayEntries } from '@/lib/craft-slot-display'
import ItemImage from './ItemImage'
import { useConfirm } from '@/components/ConfirmDialog'
import { useToast } from './ToastProvider'

interface Props {
  initialTasks: CraftQueueItem[]
  readOnly?: boolean
}

// 진행 중 (queued/claimed/delivered) 작업 + 강제 취소 / 실버 변환 버튼.
// 멤버용 큐 클라이언트와 동일하게 이벤트별로 그룹화해서 어드민이 한 이벤트의
// 청구 묶음을 한눈에 볼 수 있게 한다. event_id 가 null 인 청구(트래킹 사망 직접
// 신청 또는 이벤트 삭제됨) 는 맨 뒤 "이벤트 미연결" 그룹으로 분리.
export default function AdminCraftTasksList({ initialTasks, readOnly = false }: Props) {
  const t = useTranslations('adminCraft')
  const tRole = useTranslations('slotRole')
  const toast = useToast()
  const router = useRouter()
  const [pendingTarget, setPendingTarget] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [adjustTarget, setAdjustTarget] = useState<{ taskId: string; amount: string } | null>(null)
  const [rejectTarget, setRejectTarget] = useState<{ taskId: string; reason: string } | null>(null)
  const [bulkReceipt, setBulkReceipt] = useState<{ ok: number; failed: number } | null>(null)
  const askConfirm = useConfirm()

  const groups = useMemo(() => groupByEvent(initialTasks), [initialTasks])
  const pendingReimbursementTaskIds = useMemo(
    () =>
      initialTasks
        .filter(
          (task) =>
            task.supplyStatus == null &&
            task.reimbursementStatus === 'pending' && (task.reimbursementSilver ?? 0) > 0,
        )
        .map((task) => task.taskId),
    [initialTasks],
  )

  const toggleGroupCollapsed = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const onCancel = async (taskId: string) => {
    const ok = await askConfirm({ body: t('confirmCancelTask'), destructive: true })
    if (!ok) return
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

  const onConvert = async (taskId: string) => {
    const ok = await askConfirm({ body: t('confirmConvertTask'), destructive: false })
    if (!ok) return
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

  const onRevert = async (taskId: string) => {
    const ok = await askConfirm({ body: t('confirmRevertTask'), destructive: true })
    if (!ok) return
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

  const onApproveReimbursement = async (taskId: string) => {
    const ok = await askConfirm({ body: t('confirmApproveReimbursement'), destructive: false })
    if (!ok) return
    setPendingTarget(taskId)
    startTransition(async () => {
      const r = await approveCraftReimbursementAdmin(taskId)
      setPendingTarget(null)
      if (r.error) {
        toast.error(r.error)
        return
      }
      toast.success(t('toastReimbursementApproved', { amount: formatSilver(r.amount ?? 0) }))
      router.refresh()
    })
  }

  const onAdjustReimbursement = async (taskId: string, amountRaw: string) => {
    const normalized = amountRaw.trim().replace(/,/g, '')
    const amount = Number(normalized)
    if (!Number.isInteger(amount) || amount < 0) {
      toast.error(t('reimbursementAdjustInvalid'))
      return
    }
    const ok = await askConfirm({
      body: t('confirmAdjustReimbursement', { amount: formatSilver(amount) }),
      destructive: false,
    })
    if (!ok) return
    setPendingTarget(taskId)
    startTransition(async () => {
      const r = await approveCraftReimbursementAdjustedAdmin(taskId, amount)
      setPendingTarget(null)
      if (r.error) {
        toast.error(r.error)
        return
      }
      setAdjustTarget(null)
      toast.success(t('toastReimbursementApproved', { amount: formatSilver(r.amount ?? 0) }))
      router.refresh()
    })
  }

  const onRejectReimbursement = async (taskId: string, reason: string) => {
    const ok = await askConfirm({ body: t('confirmRejectReimbursement'), destructive: true })
    if (!ok) return
    setPendingTarget(taskId)
    startTransition(async () => {
      const r = await rejectCraftReimbursementAdmin(taskId, reason)
      setPendingTarget(null)
      if (r.error) {
        toast.error(r.error)
        return
      }
      setRejectTarget(null)
      toast.success(t('toastReimbursementRejected'))
      router.refresh()
    })
  }

  const onBulkApproveReimbursements = async () => {
    if (pendingReimbursementTaskIds.length === 0) return
    const ok = await askConfirm({
      body: t('confirmBulkApproveReimbursement', {
        count: pendingReimbursementTaskIds.length,
      }),
      destructive: false,
    })
    if (!ok) return
    setBulkReceipt(null)
    setPendingTarget('__bulk_reimbursement__')
    startTransition(async () => {
      const r = await bulkApproveCraftReimbursementsAdmin(pendingReimbursementTaskIds)
      setPendingTarget(null)
      if (r.error) {
        toast.error(r.error)
        return
      }
      setBulkReceipt({ ok: r.ok, failed: r.failed })
      if (r.failed > 0) {
        toast.error(t('toastBulkReimbursementPartial', { ok: r.ok, failed: r.failed }))
      } else {
        toast.success(t('toastBulkReimbursementApproved', { count: r.ok }))
      }
      router.refresh()
    })
  }

  return (
    <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-white flex items-center gap-2 flex-wrap">
            <ListChecks size={16} className="text-amber-400" />
            {t('tasksTitle')}
            <span className="text-xs text-gray-500">({initialTasks.length})</span>
            {pendingReimbursementTaskIds.length > 0 && (
              <span className="text-[10px] font-bold rounded bg-amber-500/15 text-amber-200 border border-amber-500/30 px-2 py-0.5">
                {t('pendingReimbursementBadge', {
                  count: pendingReimbursementTaskIds.length,
                })}
              </span>
            )}
          </h2>
          <p className="text-xs text-gray-500 mt-1">{t('tasksHint')}</p>
        </div>
        {!readOnly && pendingReimbursementTaskIds.length > 0 && (
          <button
            type="button"
            onClick={onBulkApproveReimbursements}
            disabled={pendingTarget === '__bulk_reimbursement__'}
            className="text-[11px] text-emerald-300 hover:text-emerald-200 border border-emerald-500/30 hover:border-emerald-500/60 rounded px-2.5 py-1.5 inline-flex items-center gap-1 disabled:opacity-50"
          >
            <CheckCheck size={12} />
            {pendingTarget === '__bulk_reimbursement__'
              ? t('processing')
              : t('bulkApproveReimbursement', {
                  count: pendingReimbursementTaskIds.length,
                })}
          </button>
        )}
      </div>
      {bulkReceipt && (
        <div
          role="status"
          className={`rounded-lg border px-3 py-2 text-xs ${
            bulkReceipt.failed > 0
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
          }`}
        >
          <p className="font-semibold">{t('bulkReceiptTitle')}</p>
          <p className="mt-1">
            {t('bulkReceiptSummary', { ok: bulkReceipt.ok, failed: bulkReceipt.failed })}
          </p>
          {bulkReceipt.failed > 0 && (
            <p className="mt-1 text-amber-100/80">{t('bulkReceiptRetryHint')}</p>
          )}
        </div>
      )}
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
              onApproveReimbursement={onApproveReimbursement}
              onAdjustReimbursement={onAdjustReimbursement}
              onRejectReimbursement={onRejectReimbursement}
              adjustTarget={adjustTarget}
              rejectTarget={rejectTarget}
              setAdjustTarget={setAdjustTarget}
              setRejectTarget={setRejectTarget}
              tRole={tRole}
              t={t}
              readOnly={readOnly}
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
  onApproveReimbursement: (id: string) => void
  onAdjustReimbursement: (id: string, amount: string) => void
  onRejectReimbursement: (id: string, reason: string) => void
  adjustTarget: { taskId: string; amount: string } | null
  rejectTarget: { taskId: string; reason: string } | null
  setAdjustTarget: (target: { taskId: string; amount: string } | null) => void
  setRejectTarget: (target: { taskId: string; reason: string } | null) => void
  tRole: ReturnType<typeof useTranslations>
  t: ReturnType<typeof useTranslations>
  readOnly: boolean
}

function GroupSection({
  group,
  collapsed,
  onToggle,
  pendingTarget,
  onCancel,
  onConvert,
  onRevert,
  onApproveReimbursement,
  onAdjustReimbursement,
  onRejectReimbursement,
  adjustTarget,
  rejectTarget,
  setAdjustTarget,
  setRejectTarget,
  tRole,
  t,
  readOnly,
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
            const canApproveReimbursement =
              task.supplyStatus == null &&
              task.reimbursementStatus === 'pending' &&
              (task.reimbursementSilver ?? 0) > 0
            const slotEntries = getCraftSlotDisplayEntries(
              task.buildSnapshot,
              task.craftIncludedSlots,
            )
            const isAdjusting = adjustTarget?.taskId === task.taskId
            const isRejecting = rejectTarget?.taskId === task.taskId
            return (
              <li
                key={task.taskId}
                className="bg-gray-950 p-3 space-y-2"
                style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 260px' }}
              >
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

                {slotEntries.length > 0 && (
                  <div className="border-t border-gray-800 pt-2 space-y-1.5">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider">
                      {t('fulfillmentSlotsLabel')}
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {slotEntries.map(({ slot, item }) => (
                        <ItemImage
                          key={slot}
                          itemId={item.id}
                          itemName={item.name}
                          size={28}
                          hoverPreview
                        />
                      ))}
                    </div>
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
                  {task.supplyStatus ? (
                    <span className="text-amber-300 font-mono">
                      · {t('settlementSummaryInline', {
                        material: formatSilver(task.materialReimbursementSilver),
                        fee: formatSilver(task.craftFeeSilver),
                        total: formatSilver(task.settlementTotalSilver),
                        status: task.settlementStatus === 'paid'
                          ? t('settlementStatusPaid')
                          : task.settlementStatus === 'payable'
                            ? t('settlementStatusPayable')
                            : t('settlementStatusNone'),
                      })}
                    </span>
                  ) : task.materialSilverCost != null ? (
                    <span className="text-gray-500">
                      · {t('taskMaterial', { silver: formatSilver(task.materialSilverCost) })}
                    </span>
                  ) : null}
                  {task.supplyStatus == null && (task.reimbursementSilver ?? 0) > 0 && (
                    <span
                      className={
                        task.reimbursementStatus === 'pending'
                          ? 'text-amber-300 font-mono'
                          : task.reimbursementStatus === 'approved'
                            ? 'text-emerald-300 font-mono'
                            : 'text-gray-500 font-mono'
                      }
                    >
                      · {task.reimbursementStatus === 'pending'
                        ? t('reimbursementPending', { silver: formatSilver(task.reimbursementSilver ?? 0) })
                        : task.reimbursementStatus === 'approved'
                          ? t('reimbursementApproved', { silver: formatSilver(task.reimbursementSilver ?? 0) })
                          : task.reimbursementStatus === 'rejected'
                            ? t('reimbursementRejected', { silver: formatSilver(task.reimbursementSilver ?? 0) })
                            : formatSilver(task.reimbursementSilver ?? 0)}
                    </span>
                  )}
                </div>

                {!readOnly && isAdjusting && (
                  <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-2 flex flex-wrap items-center gap-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={task.reimbursementSilver ?? undefined}
                      value={adjustTarget?.amount ?? ''}
                      onChange={(e) =>
                        setAdjustTarget({ taskId: task.taskId, amount: e.target.value })
                      }
                      disabled={isPending}
                      className="w-32 bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                      aria-label={t('reimbursementAdjustAmount')}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        onAdjustReimbursement(task.taskId, adjustTarget?.amount ?? '')
                      }
                      disabled={isPending}
                      className="text-[11px] text-emerald-300 hover:text-emerald-200 border border-emerald-500/30 hover:border-emerald-500/60 rounded px-2 py-1 disabled:opacity-50"
                    >
                      {t('reimbursementAdjustSubmit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjustTarget(null)}
                      disabled={isPending}
                      className="text-[11px] text-gray-400 hover:text-white px-1 py-1 disabled:opacity-50"
                    >
                      {t('cancelInline')}
                    </button>
                  </div>
                )}

                {!readOnly && isRejecting && (
                  <div className="rounded-lg border border-rose-500/25 bg-rose-500/5 p-2 space-y-2">
                    <textarea
                      value={rejectTarget?.reason ?? ''}
                      onChange={(e) =>
                        setRejectTarget({ taskId: task.taskId, reason: e.target.value })
                      }
                      disabled={isPending}
                      maxLength={500}
                      placeholder={t('reimbursementRejectReasonPlaceholder')}
                      className="w-full min-h-16 bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-rose-500"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setRejectTarget(null)}
                        disabled={isPending}
                        className="text-[11px] text-gray-400 hover:text-white px-1 py-1 disabled:opacity-50"
                      >
                        {t('cancelInline')}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onRejectReimbursement(task.taskId, rejectTarget?.reason ?? '')
                        }
                        disabled={isPending}
                        className="text-[11px] text-rose-300 hover:text-rose-200 border border-rose-500/30 hover:border-rose-500/60 rounded px-2 py-1 disabled:opacity-50"
                      >
                        {t('reimbursementRejectSubmit')}
                      </button>
                    </div>
                  </div>
                )}

                {!readOnly && (canCancelOrConvert || canApproveReimbursement) && (
                  <div className="flex items-center justify-end gap-2 pt-1">
                    {canApproveReimbursement && (
                      <>
                        <button
                          type="button"
                          onClick={() => onApproveReimbursement(task.taskId)}
                          disabled={isPending}
                          className="text-[11px] text-emerald-300 hover:text-emerald-200 border border-emerald-500/30 hover:border-emerald-500/60 rounded px-2 py-1 inline-flex items-center gap-1 disabled:opacity-50"
                        >
                          <CheckCircle2 size={11} />
                          {isPending ? t('processing') : t('approveReimbursement')}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setAdjustTarget({
                              taskId: task.taskId,
                              amount: String(task.reimbursementSilver ?? 0),
                            })
                          }
                          disabled={isPending}
                          className="text-[11px] text-amber-300 hover:text-amber-200 border border-amber-500/30 hover:border-amber-500/60 rounded px-2 py-1 inline-flex items-center gap-1 disabled:opacity-50"
                        >
                          <Pencil size={11} />
                          {t('adjustReimbursement')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setRejectTarget({ taskId: task.taskId, reason: '' })}
                          disabled={isPending}
                          className="text-[11px] text-rose-300 hover:text-rose-200 border border-rose-500/30 hover:border-rose-500/60 rounded px-2 py-1 inline-flex items-center gap-1 disabled:opacity-50"
                        >
                          <Ban size={11} />
                          {t('rejectReimbursement')}
                        </button>
                      </>
                    )}
                    {canCancelOrConvert && (
                      <>
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
                      </>
                    )}
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
