'use client'

import { useMemo, useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
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

const STATUS_BADGE: Record<DeathState['status'], string> = {
  pending: 'bg-yellow-500/20 text-yellow-300',
  approved: 'bg-green-500/20 text-green-300',
  rejected: 'bg-gray-700 text-gray-300',
}

export function DemoAutoRegear() {
  const t = useTranslations('demo.autoRegear')
  const [activeId, setActiveId] = useState(DEMO_AUTO_REGEAR_DEATHS[0]!.id)
  const [state, setState] = useState<Record<string, DeathState>>(() => buildInitialState())

  const active = DEMO_AUTO_REGEAR_DEATHS.find((d) => d.id === activeId)!
  const activeState = state[activeId]!

  const total = useMemo(
    () =>
      activeState.pieces.filter((p) => !p.excluded).reduce((sum, p) => sum + p.adjusted, 0),
    [activeState.pieces],
  )

  function updatePiece(
    slot: DemoRegearPiece['slot'],
    next: Partial<{ adjusted: number; excluded: boolean }>,
  ) {
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {DEMO_AUTO_REGEAR_DEATHS.map((d) => {
          const s = state[d.id]!
          const isActive = d.id === activeId
          return (
            <button
              key={d.id}
              onClick={() => setActiveId(d.id)}
              className={`text-left rounded-lg border px-4 py-3 transition-colors ${
                isActive
                  ? 'bg-gray-900 border-amber-500/40'
                  : 'bg-gray-900 border-gray-800 hover:border-gray-700'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-white text-sm font-semibold truncate">{d.victim}</span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${STATUS_BADGE[s.status]}`}>
                  {s.status === 'pending'
                    ? t('statusPending')
                    : s.status === 'approved'
                      ? t('statusApproved')
                      : t('statusRejected')}
                </span>
              </div>
              <div className="text-[11px] text-gray-500 truncate">{d.diedAt}</div>
              <div className="text-[11px] text-gray-400 truncate mt-0.5">{d.battleLabel}</div>
            </button>
          )
        })}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-white truncate">{active.victim}</h3>
            <p className="text-xs text-gray-400 mt-0.5 truncate">{active.battleLabel}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {t('killedBy')}: {active.killer}
            </p>
          </div>
          <span
            className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_BADGE[activeState.status]}`}
          >
            {activeState.status === 'pending'
              ? t('statusPending')
              : activeState.status === 'approved'
                ? t('statusApproved')
                : t('statusRejected')}
          </span>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-950 text-xs text-gray-400 uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">{t('rowSlot')}</th>
              <th className="px-3 py-2 text-left font-semibold">{t('rowItem')}</th>
              <th className="px-3 py-2 text-center font-semibold">{t('rowInclude')}</th>
              <th className="px-3 py-2 text-right font-semibold">{t('rowPrice')}</th>
            </tr>
          </thead>
          <tbody>
            {activeState.pieces.map((piece) => (
              <tr
                key={piece.slot}
                className={`border-t border-gray-800 ${piece.excluded ? 'opacity-40' : ''}`}
              >
                <td className="px-3 py-2 text-[11px] uppercase tracking-wider text-gray-400 font-semibold">
                  {t(SLOT_LABEL_KEY[piece.slot])}
                </td>
                <td className="px-3 py-2 text-white text-xs truncate">{piece.itemLabel}</td>
                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={!piece.excluded}
                    onChange={(e) => updatePiece(piece.slot, { excluded: !e.target.checked })}
                    className="accent-amber-500 cursor-pointer"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    value={piece.adjusted}
                    disabled={piece.excluded}
                    onChange={(e) =>
                      updatePiece(piece.slot, {
                        adjusted: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="w-28 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white text-right font-mono focus:outline-none focus:border-amber-500 disabled:opacity-50"
                  />
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-gray-700 bg-gray-950">
              <td className="px-3 py-2.5 text-xs uppercase tracking-wide text-gray-400 font-semibold" colSpan={3}>
                {t('totalLabel')}
              </td>
              <td className="px-3 py-2.5 text-right font-mono font-bold text-amber-400">
                {formatSilver(total)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setStatus('approved')}
          disabled={activeState.status === 'approved'}
          className="flex-1 inline-flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-black text-sm font-bold rounded-lg py-2.5 transition-colors"
        >
          <CheckCircle2 size={16} />
          {t('approveButton')}
        </button>
        <button
          onClick={() => setStatus('rejected')}
          disabled={activeState.status === 'rejected'}
          className="inline-flex items-center justify-center gap-1.5 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed text-red-300 border border-red-500/30 text-sm font-medium rounded-lg px-5 py-2.5 transition-colors"
        >
          <XCircle size={16} />
          {t('rejectButton')}
        </button>
      </div>

      <div className="text-xs text-gray-500 italic">{t('hint')}</div>
    </div>
  )
}
