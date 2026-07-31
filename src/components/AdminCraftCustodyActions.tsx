'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ArrowRightLeft, RotateCcw, X } from 'lucide-react'
import {
  moveCraftBoxAdmin,
  returnUnclaimedCraftAdmin,
} from '@/app/actions/craft-admin'
import { useToast } from './ToastProvider'

export default function AdminCraftCustodyActions({
  taskId,
  currentBox,
  canMove,
  canReturn,
}: {
  taskId: string
  currentBox: number
  canMove: boolean
  canReturn: boolean
}) {
  const t = useTranslations('adminCraft')
  const toast = useToast()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [mode, setMode] = useState<'move' | 'return' | null>(null)
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null)
  const [box, setBox] = useState('')
  const [reason, setReason] = useState('')

  if (!canMove && !canReturn) return null

  function move() {
    if (!idempotencyKey) return
    const nextBox = Number(box)
    if (!Number.isInteger(nextBox) || nextBox < 1 || nextBox > 999) {
      toast.error(t('boxRangeInvalid'))
      return
    }
    startTransition(async () => {
      const result = await moveCraftBoxAdmin(taskId, nextBox, idempotencyKey)
      if (result.error) return toast.error(result.error)
      toast.success(t('boxMoveSuccess', { box: nextBox }))
      setMode(null)
      setIdempotencyKey(null)
      setBox('')
      router.refresh()
    })
  }

  function returnUnclaimed() {
    if (!idempotencyKey) return
    startTransition(async () => {
      const result = await returnUnclaimedCraftAdmin(taskId, reason, idempotencyKey)
      if (result.error) return toast.error(result.error)
      toast.success(t('unclaimedReturnSuccess'))
      setMode(null)
      setIdempotencyKey(null)
      setReason('')
      router.refresh()
    })
  }

  if (!mode) {
    return (
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {canMove && <button
          type="button"
          onClick={() => {
            setMode('move')
            setBox('')
            setIdempotencyKey(crypto.randomUUID())
          }}
          className="inline-flex items-center gap-1 rounded border border-sky-500/30 px-2 py-1 text-[10px] text-sky-300 hover:bg-sky-500/10"
        >
          <ArrowRightLeft size={10} /> {t('boxMove')}
        </button>}
        {canReturn && <button
          type="button"
          onClick={() => {
            setMode('return')
            setReason('')
            setIdempotencyKey(crypto.randomUUID())
          }}
          className="inline-flex items-center gap-1 rounded border border-rose-500/30 px-2 py-1 text-[10px] text-rose-300 hover:bg-rose-500/10"
        >
          <RotateCcw size={10} /> {t('unclaimedReturn')}
        </button>}
      </div>
    )
  }

  return (
    <div className="mt-2 w-full rounded-lg border border-gray-700 bg-gray-900 p-2">
      {mode === 'move' ? (
        <>
          <p className="mb-2 text-[11px] text-gray-300">
            {t('boxMoveConfirm', { box: currentBox })}
          </p>
          <input
            type="number"
            min={1}
            max={999}
            value={box}
            onChange={(event) => setBox(event.target.value)}
            placeholder={t('boxMovePlaceholder')}
            disabled={pending}
            className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-white"
          />
        </>
      ) : (
        <>
          <p className="mb-2 text-[11px] text-rose-200">{t('unclaimedReturnConfirm')}</p>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            placeholder={t('unclaimedReturnReasonPlaceholder')}
            disabled={pending}
            className="w-full rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-white"
          />
        </>
      )}
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setMode(null)
            setIdempotencyKey(null)
            setBox('')
            setReason('')
          }}
          disabled={pending}
          className="inline-flex items-center gap-1 px-2 py-1 text-[10px] text-gray-400"
        >
          <X size={10} /> {t('custodyActionCancel')}
        </button>
        <button
          type="button"
          onClick={mode === 'move' ? move : returnUnclaimed}
          disabled={pending || !idempotencyKey || (mode === 'move' && !box)}
          className="rounded bg-white px-2 py-1 text-[10px] font-semibold text-gray-950 disabled:opacity-50"
        >
          {pending ? t('processing') : mode === 'move' ? t('boxMoveFinal') : t('unclaimedReturnFinal')}
        </button>
      </div>
    </div>
  )
}
