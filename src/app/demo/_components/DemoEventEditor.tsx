'use client'

import { useState } from 'react'
import { Target, X, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { DEMO_INITIAL_EVENT, DEMO_TEMPLATES, type DemoEvent, type DemoSlot } from '@/data/demo-seed'

function cloneEvent(source: DemoEvent): DemoEvent {
  return {
    ...source,
    slots: source.slots.map((slot) => ({ ...slot })),
  }
}

function eventFromTemplate(templateId: string): DemoEvent {
  const tmpl = DEMO_TEMPLATES.find((t) => t.id === templateId)
  if (!tmpl) return cloneEvent(DEMO_INITIAL_EVENT)
  return {
    id: `demo-evt-${templateId}`,
    name: `${tmpl.name} — 데모`,
    scheduledLabel: '오늘 22:00 KST',
    templateLabel: tmpl.name,
    slots: tmpl.slots.map((s, idx) => ({
      ...s,
      id: `slot-tmpl-${idx}`,
    })),
  }
}

export function DemoEventEditor() {
  const t = useTranslations('demo.events')
  const [event, setEvent] = useState<DemoEvent>(() => cloneEvent(DEMO_INITIAL_EVENT))
  const [openSlotId, setOpenSlotId] = useState<string | null>(null)
  const [pendingName, setPendingName] = useState('')

  function handleAssign(slotId: string, name: string) {
    setEvent((prev) => ({
      ...prev,
      slots: prev.slots.map((s) => (s.id === slotId ? { ...s, assigned: name } : s)),
    }))
  }

  function handleClear(slotId: string) {
    setEvent((prev) => ({
      ...prev,
      slots: prev.slots.map((s) => (s.id === slotId ? { ...s, assigned: undefined } : s)),
    }))
  }

  function handleTemplateChange(templateId: string) {
    setEvent(eventFromTemplate(templateId))
  }

  const filledCount = event.slots.filter((s) => s.assigned).length
  const totalCount = event.slots.length

  return (
    <div className="space-y-4">
      <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm sm:text-base font-bold text-white truncate">{event.name}</div>
          <div className="text-xs text-gray-400 mt-0.5">
            {event.scheduledLabel} · {t('templateLabel')}: {event.templateLabel}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) handleTemplateChange(e.target.value)
              e.target.value = ''
            }}
            className="text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-amber-500"
          >
            <option value="">{t('chooseTemplate')}</option>
            {DEMO_TEMPLATES.map((tmpl) => (
              <option key={tmpl.id} value={tmpl.id}>
                {tmpl.name}
              </option>
            ))}
          </select>
          <span className="text-xs font-mono font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-full px-3 py-1">
            {filledCount} / {totalCount}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3">
        {event.slots.map((slot, idx) => (
          <SlotCard
            key={slot.id}
            slot={slot}
            slotNumber={idx + 1}
            onOpenAssign={() => {
              setOpenSlotId(slot.id)
              setPendingName('')
            }}
            onClear={() => handleClear(slot.id)}
          />
        ))}
      </div>

      <div className="text-xs text-gray-500 italic">{t('hint')}</div>

      {openSlotId && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-4"
          onClick={() => setOpenSlotId(null)}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-xl p-5 w-full max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-semibold text-white mb-3">{t('modalTitle')}</div>
            <input
              type="text"
              autoFocus
              value={pendingName}
              onChange={(e) => setPendingName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && pendingName.trim()) {
                  handleAssign(openSlotId, pendingName.trim())
                  setOpenSlotId(null)
                }
              }}
              placeholder={t('namePlaceholder')}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 mb-3"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (pendingName.trim()) {
                    handleAssign(openSlotId, pendingName.trim())
                    setOpenSlotId(null)
                  }
                }}
                disabled={!pendingName.trim()}
                className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-black text-sm font-bold rounded py-2"
              >
                {t('assignButton')}
              </button>
              <button
                onClick={() => setOpenSlotId(null)}
                className="px-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-sm rounded py-2"
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SlotCard({
  slot,
  slotNumber,
  onOpenAssign,
  onClear,
}: {
  slot: DemoSlot
  slotNumber: number
  onOpenAssign: () => void
  onClear: () => void
}) {
  const t = useTranslations('demo.events')
  const isAssigned = !!slot.assigned

  const cardClass = isAssigned
    ? 'bg-gray-900/60 border-gray-700'
    : 'bg-gray-900 border-gray-600 hover:border-gray-500'

  return (
    <div className={`rounded-xl p-2.5 space-y-2 border transition-colors group relative ${cardClass}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-gray-500 text-[12px] font-mono">#{slotNumber}</span>
        <span
          className={`text-[12px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-1 ${
            slot.isCaller
              ? 'bg-amber-500/20 text-amber-400'
              : 'bg-gray-800 text-gray-300'
          }`}
        >
          {slot.isCaller && <Target size={10} />}
          {slot.role}
        </span>
      </div>

      <div className="text-[11px] text-gray-400 truncate">{slot.buildLabel}</div>

      <div className="grid grid-cols-4 gap-1">
        <div className="col-span-2 row-span-2 aspect-square bg-gray-800/60 border border-gray-700 rounded flex items-center justify-center text-[9px] text-gray-500 uppercase tracking-wider">
          {slot.weapon.split(' ')[0]}
        </div>
        <div className="aspect-square bg-gray-800/60 border border-gray-700 rounded" />
        <div className="aspect-square bg-gray-800/60 border border-gray-700 rounded" />
        <div className="aspect-square bg-gray-800/60 border border-gray-700 rounded" />
        <div className="aspect-square bg-gray-800/60 border border-gray-700 rounded" />
      </div>

      {isAssigned ? (
        <div className="flex items-center justify-between gap-1 pt-1">
          <span className="text-green-400 text-sm font-semibold truncate">{slot.assigned}</span>
          <button
            onClick={onClear}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-red-400 shrink-0"
            aria-label={t('clearSlot')}
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <button
          onClick={onOpenAssign}
          className="w-full inline-flex items-center justify-center gap-1 text-[12px] font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 rounded px-2 py-1"
        >
          <Plus size={12} />
          {t('joinButton')}
        </button>
      )}
    </div>
  )
}
