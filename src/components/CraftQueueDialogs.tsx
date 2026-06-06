'use client'

import { useEffect, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import {
  computeAutoAssignBox,
  type CraftBoxConfig,
  type CraftCompensationMode,
  type CraftQueueItem,
  type AutoAssignReason,
} from '@/app/actions/craft'
import {
  claimCraftQueueItem,
  deliverCraftQueueItem,
} from '@/app/actions/craft-queue'
import { useToast } from './ToastProvider'

interface ClaimDialogProps {
  item: CraftQueueItem
  defaultMode: CraftCompensationMode
  defaultPremiumPct: number
  onClose: () => void
  onSuccess: () => void
}

export function ClaimDialog({
  item,
  defaultMode,
  defaultPremiumPct,
  onClose,
  onSuccess,
}: ClaimDialogProps) {
  const t = useTranslations('craftQueue')
  const toast = useToast()
  const [mode, setMode] = useState<CraftCompensationMode>(defaultMode)
  const [premiumPct, setPremiumPct] = useState(String(defaultPremiumPct))
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, pending])

  const submit = () => {
    const parsed = Number(premiumPct)
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0 || parsed > 200) {
      toast.error(t('premiumOutOfRange'))
      return
    }
    startTransition(async () => {
      const r = await claimCraftQueueItem({
        taskId: item.taskId,
        compensationMode: mode,
        premiumPct: parsed,
      })
      if (r.error) {
        toast.error(r.error)
        return
      }
      onSuccess()
    })
  }

  return (
    <ModalShell onClose={() => !pending && onClose()} title={t('claimDialogTitle')}>
      <p className="text-[11px] text-gray-400">{t('claimDialogHint')}</p>
      <div className="grid grid-cols-2 gap-2">
        {(['volunteer', 'paid'] as const).map((m) => {
          const active = mode === m
          return (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              disabled={pending}
              className={`text-left rounded-lg border px-3 py-2 ${
                active
                  ? 'border-amber-400 bg-amber-500/10 text-amber-200'
                  : 'border-gray-700 bg-gray-950 text-gray-300 hover:border-gray-500'
              } disabled:opacity-50`}
            >
              <p className="text-xs font-bold">
                {m === 'paid' ? t('modePaid') : t('modeVolunteer')}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {m === 'paid' ? t('modePaidHint') : t('modeVolunteerHint')}
              </p>
            </button>
          )
        })}
      </div>
      {mode === 'paid' && (
        <div>
          <label className="block text-[11px] text-gray-400 mb-1">{t('premiumLabel')}</label>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={200}
            value={premiumPct}
            onChange={(e) => setPremiumPct(e.target.value)}
            disabled={pending}
            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
          />
        </div>
      )}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={() => !pending && onClose()}
          disabled={pending}
          className="text-xs text-gray-400 hover:text-white px-3 py-2"
        >
          {t('cancel')}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="text-xs font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black rounded-lg px-4 py-2"
        >
          {pending ? t('claiming') : t('confirmClaim')}
        </button>
      </div>
    </ModalShell>
  )
}

interface DeliverDialogProps {
  item: CraftQueueItem
  config: CraftBoxConfig
  onClose: () => void
  onSuccess: () => void
}

export function DeliverDialog({ item, config, onClose, onSuccess }: DeliverDialogProps) {
  const t = useTranslations('craftQueue')
  const toast = useToast()
  const [boxNumber, setBoxNumber] = useState('')
  const [availableBoxes, setAvailableBoxes] = useState<number[]>([])
  const [autoAssignReason, setAutoAssignReason] = useState<AutoAssignReason | null>(null)
  const [materialCost, setMaterialCost] = useState<string>('')
  const [submitting, startSubmit] = useTransition()

  // 모달이 열리면 서버에서 자동 박스 배정을 시도한다 — 같은 요청자가 이미 점유한
  // 박스가 있으면 재사용, 없으면 크래프터 범위 안 빈 번호. 실패해도 수동 입력은
  // 항상 가능하다.
  useEffect(() => {
    let cancelled = false
    void computeAutoAssignBox(item.taskId).then((res) => {
      if (cancelled) return
      setAutoAssignReason(res.reason)
      setAvailableBoxes(res.availableBoxes)
      if (res.boxNumber != null) setBoxNumber(String(res.boxNumber))
    })
    return () => {
      cancelled = true
    }
  }, [item.taskId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, submitting])

  const submit = () => {
    const box = Number(boxNumber)
    if (!Number.isFinite(box) || !Number.isInteger(box) || box < 1) {
      toast.error(t('boxInvalid'))
      return
    }
    if (box < config.rangeMin || box > config.rangeMax) {
      toast.error(t('boxOutOfRange', { min: config.rangeMin, max: config.rangeMax }))
      return
    }
    const material = Number(materialCost)
    if (!Number.isFinite(material) || !Number.isInteger(material) || material < 0) {
      toast.error(t('materialInvalid'))
      return
    }
    startSubmit(async () => {
      const r = await deliverCraftQueueItem({
        taskId: item.taskId,
        boxNumber: box,
        materialSilverCost: material,
      })
      if (r.error) {
        toast.error(r.error)
        return
      }
      onSuccess()
    })
  }

  const pending = submitting
  return (
    <ModalShell onClose={() => !pending && onClose()} title={t('deliverDialogTitle')}>
      <p className="text-[11px] text-gray-400">{t('deliverDialogHint')}</p>

      <div>
        <label className="block text-[11px] text-gray-400 mb-1">
          {t('boxLabelInput', { min: config.rangeMin, max: config.rangeMax })}
        </label>
        <input
          type="number"
          inputMode="numeric"
          min={config.rangeMin}
          max={config.rangeMax}
          value={boxNumber}
          onChange={(e) => setBoxNumber(e.target.value)}
          disabled={pending}
          placeholder={t('boxPlaceholder')}
          className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
        />
        {autoAssignReason && (
          <p
            className={`text-[10px] mt-1 ${
              autoAssignReason === 'rangeFull' || autoAssignReason === 'noRange'
                ? 'text-amber-300/80'
                : 'text-emerald-300/80'
            }`}
          >
            {t(`autoAssignReason.${autoAssignReason}`)}
          </p>
        )}
        {availableBoxes.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {availableBoxes.slice(0, 12).map((box) => (
              <button
                key={box}
                type="button"
                onClick={() => setBoxNumber(String(box))}
                disabled={pending}
                className={`text-[11px] font-mono rounded border px-2 py-1 ${
                  boxNumber === String(box)
                    ? 'border-emerald-400 bg-emerald-500/10 text-emerald-200'
                    : 'border-gray-700 bg-gray-950 text-gray-300 hover:border-gray-500'
                } disabled:opacity-50`}
              >
                #{box}
              </button>
            ))}
            {availableBoxes.length > 12 && (
              <span className="text-[10px] text-gray-500 self-center">
                {t('availableBoxesMore', { count: availableBoxes.length - 12 })}
              </span>
            )}
          </div>
        )}
      </div>

      <div>
        <label className="block text-[11px] text-gray-400 mb-1">{t('materialLabel')}</label>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={materialCost}
          onChange={(e) => setMaterialCost(e.target.value)}
          disabled={pending}
          placeholder={t('materialPlaceholder')}
          className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
        />
        <p className="text-[10px] text-gray-500 mt-1">{t('materialHint')}</p>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={() => !pending && onClose()}
          disabled={pending}
          className="text-xs text-gray-400 hover:text-white px-3 py-2"
        >
          {t('cancel')}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="text-xs font-bold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black rounded-lg px-4 py-2"
        >
          {submitting ? t('delivering') : t('confirmDeliver')}
        </button>
      </div>
    </ModalShell>
  )
}

interface ModalShellProps {
  onClose: () => void
  title: string
  children: React.ReactNode
}

function ModalShell({ onClose, title, children }: ModalShellProps) {
  // body scroll lock while open.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        className="bg-gray-900 border border-gray-700 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[92dvh] flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h3 className="font-bold text-white text-base">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white"
            aria-label="close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 text-sm">{children}</div>
      </div>
    </div>
  )
}
