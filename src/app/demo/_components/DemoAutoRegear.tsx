'use client'

import { useMemo, useState } from 'react'
import { CheckCircle2, Hammer, XCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { DEMO_AUTO_REGEAR_DEATHS, type DemoRegearPiece } from '@/data/demo-seed'

type DeathState = {
  pieces: Array<DemoRegearPiece & { adjusted: number; excluded: boolean }>
  status: 'pending' | 'approved' | 'rejected'
}

function buildInitialState() {
  return DEMO_AUTO_REGEAR_DEATHS.reduce<Record<string, DeathState>>((acc, death) => {
    acc[death.id] = {
      pieces: death.pieces.map((p) => ({ ...p, adjusted: p.estimatedSilver, excluded: false })),
      status: 'pending',
    }
    return acc
  }, {})
}

const SLOT_LABEL_KEY: Record<DemoRegearPiece['slot'], string> = {
  head: 'slotHead',
  armor: 'slotArmor',
  shoes: 'slotShoes',
  weapon: 'slotWeapon',
  offhand: 'slotOffhand',
  cape: 'slotCape',
}

function formatSilver(n: number): string {
  return n.toLocaleString('en-US')
}

export function DemoAutoRegear() {
  const t = useTranslations('demo.autoRegear')
  const [activeId, setActiveId] = useState(DEMO_AUTO_REGEAR_DEATHS[0]!.id)
  const [state, setState] = useState<Record<string, DeathState>>(() => buildInitialState())

  const active = DEMO_AUTO_REGEAR_DEATHS.find((d) => d.id === activeId)!
  const activeState = state[activeId]!

  const total = useMemo(
    () =>
      activeState.pieces
        .filter((p) => !p.excluded)
        .reduce((sum, p) => sum + p.adjusted, 0),
    [activeState.pieces],
  )

  function updatePiece(slot: DemoRegearPiece['slot'], next: Partial<{ adjusted: number; excluded: boolean }>) {
    setState((prev) => ({
      ...prev,
      [activeId]: {
        ...prev[activeId]!,
        pieces: prev[activeId]!.pieces.map((p) => (p.slot === slot ? { ...p, ...next } : p)),
      },
    }))
  }

  function setStatus(status: DeathState['status']) {
    setState((prev) => ({
      ...prev,
      [activeId]: { ...prev[activeId]!, status },
    }))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {DEMO_AUTO_REGEAR_DEATHS.map((d) => {
          const s = state[d.id]!
          const isActive = d.id === activeId
          return (
            <button
              key={d.id}
              onClick={() => setActiveId(d.id)}
              className={`text-left text-xs rounded-lg border px-3 py-2 transition-colors ${
                isActive
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-100'
                  : 'bg-white/[0.03] border-white/10 hover:border-white/20 text-white/70'
              }`}
            >
              <div className="font-semibold">{d.victim}</div>
              <div className="text-[10px] text-white/50 mt-0.5">{d.diedAt}</div>
              {s.status !== 'pending' && (
                <div
                  className={`text-[10px] mt-1 ${
                    s.status === 'approved' ? 'text-emerald-300' : 'text-rose-300'
                  }`}
                >
                  {s.status === 'approved' ? t('statusApproved') : t('statusRejected')}
                </div>
              )}
            </button>
          )
        })}
      </div>

      <div className="rounded-xl bg-[#0b0d12] border border-white/10 p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <div className="text-xs text-white/50 mb-0.5">{active.battleLabel}</div>
            <div className="text-sm font-semibold">
              <span className="text-white/60">{t('claimerLabel')}: </span>
              {active.victim}
            </div>
            <div className="text-[11px] text-white/40 mt-0.5">
              {t('killedBy')}: {active.killer}
            </div>
          </div>
          <span
            className={`text-xs rounded-full px-3 py-1 self-start ${
              activeState.status === 'pending'
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                : activeState.status === 'approved'
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
            }`}
          >
            {activeState.status === 'pending'
              ? t('statusPending')
              : activeState.status === 'approved'
                ? t('statusApproved')
                : t('statusRejected')}
          </span>
        </div>

        <div className="rounded-lg border border-white/10 overflow-hidden mb-4">
          <div className="grid grid-cols-[80px,1fr,32px,110px] text-[10px] uppercase tracking-wider text-white/40 bg-white/[0.03] px-3 py-2 border-b border-white/10 gap-2">
            <div>{t('rowSlot')}</div>
            <div>{t('rowItem')}</div>
            <div className="text-center">{t('rowInclude')}</div>
            <div className="text-right">{t('rowPrice')}</div>
          </div>
          {activeState.pieces.map((piece) => (
            <div
              key={piece.slot}
              className={`grid grid-cols-[80px,1fr,32px,110px] text-sm px-3 py-2.5 border-b border-white/5 last:border-b-0 items-center gap-2 ${
                piece.excluded ? 'opacity-40' : ''
              }`}
            >
              <div className="text-[11px] uppercase tracking-wider text-white/50">
                {t(SLOT_LABEL_KEY[piece.slot])}
              </div>
              <div className="truncate flex items-center gap-2 text-xs">
                <Hammer size={11} className="text-white/30 shrink-0" />
                {piece.itemLabel}
              </div>
              <div className="text-center">
                <input
                  type="checkbox"
                  checked={!piece.excluded}
                  onChange={(e) =>
                    updatePiece(piece.slot, { excluded: !e.target.checked })
                  }
                  className="accent-amber-400"
                />
              </div>
              <div className="text-right">
                <input
                  type="number"
                  value={piece.adjusted}
                  disabled={piece.excluded}
                  onChange={(e) =>
                    updatePiece(piece.slot, { adjusted: Math.max(0, Number(e.target.value) || 0) })
                  }
                  className="w-24 bg-white/5 border border-white/10 rounded px-2 py-1 text-right text-xs focus:border-amber-400/60 outline-none disabled:opacity-50"
                />
              </div>
            </div>
          ))}
          <div className="grid grid-cols-[80px,1fr,32px,110px] text-sm px-3 py-2 bg-white/[0.03] border-t border-white/10 gap-2">
            <div className="font-semibold col-span-3">{t('totalLabel')}</div>
            <div className="text-right font-bold text-amber-400">{formatSilver(total)}</div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setStatus('approved')}
            disabled={activeState.status === 'approved'}
            className="flex-1 inline-flex items-center justify-center gap-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 disabled:opacity-40 disabled:cursor-not-allowed border border-emerald-500/30 text-emerald-300 text-sm font-semibold rounded-lg py-2"
          >
            <CheckCircle2 size={14} />
            {t('approveButton')}
          </button>
          <button
            onClick={() => setStatus('rejected')}
            disabled={activeState.status === 'rejected'}
            className="flex-1 inline-flex items-center justify-center gap-1.5 bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-40 disabled:cursor-not-allowed border border-rose-500/30 text-rose-300 text-sm font-medium rounded-lg py-2"
          >
            <XCircle size={14} />
            {t('rejectButton')}
          </button>
        </div>

        <div className="text-[11px] text-white/40 mt-3 italic">{t('hint')}</div>
      </div>
    </div>
  )
}
