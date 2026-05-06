'use client'

import { useState } from 'react'
import { Sparkles, Target, Shield, Sword, UserCircle2, X, Plus } from 'lucide-react'
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

function roleIcon(slot: DemoSlot) {
  if (slot.isCaller) return <Target size={14} />
  if (slot.role === '탱커') return <Shield size={14} />
  if (slot.role === '힐러' || slot.role === '서폿') return <Sparkles size={14} />
  return <Sword size={14} />
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
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-base sm:text-lg font-bold mb-1">{event.name}</div>
          <div className="text-xs text-emerald-400 font-medium">
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
            className="text-xs bg-white/5 border border-white/10 rounded-md px-2.5 py-1.5 text-white/80 focus:border-amber-400/50 outline-none"
          >
            <option value="">{t('chooseTemplate')}</option>
            {DEMO_TEMPLATES.map((tmpl) => (
              <option key={tmpl.id} value={tmpl.id}>
                {tmpl.name}
              </option>
            ))}
          </select>
          <span className="text-xs bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-full px-3 py-1">
            {filledCount} / {totalCount}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {event.slots.map((slot) => (
          <SlotCard
            key={slot.id}
            slot={slot}
            onOpenAssign={() => {
              setOpenSlotId(slot.id)
              setPendingName('')
            }}
            onClear={() => handleClear(slot.id)}
          />
        ))}
      </div>

      <div className="text-xs text-white/50 italic">{t('hint')}</div>

      {openSlotId && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center px-4"
          onClick={() => setOpenSlotId(null)}
        >
          <div
            className="bg-[#11141b] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-semibold mb-3">{t('modalTitle')}</div>
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
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm focus:border-amber-400/60 outline-none mb-3"
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
                className="flex-1 bg-emerald-500/15 hover:bg-emerald-500/25 disabled:opacity-40 disabled:cursor-not-allowed border border-emerald-500/30 text-emerald-300 text-sm font-semibold rounded-lg py-2"
              >
                {t('assignButton')}
              </button>
              <button
                onClick={() => setOpenSlotId(null)}
                className="px-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 text-sm rounded-lg py-2"
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
  onOpenAssign,
  onClear,
}: {
  slot: DemoSlot
  onOpenAssign: () => void
  onClear: () => void
}) {
  const t = useTranslations('demo.events')
  if (!slot.assigned) {
    return (
      <button
        onClick={onOpenAssign}
        className="rounded-lg border border-dashed border-white/15 p-3 text-left hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-colors w-full"
      >
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/40 mb-1">
          {slot.isCaller && <Target size={11} />}
          <span>{slot.role}</span>
        </div>
        <div className="text-xs text-white/60 mb-2">{slot.buildLabel}</div>
        <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
          <Plus size={12} />
          {t('joinButton')}
        </div>
      </button>
    )
  }

  return (
    <div
      className={`rounded-lg border p-3 group relative ${
        slot.isCaller ? 'bg-amber-500/10 border-amber-500/30' : 'bg-white/5 border-white/10'
      }`}
    >
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/50 mb-1">
        {roleIcon(slot)}
        <span className="truncate">{slot.role}</span>
        {slot.isCaller && <span className="text-amber-300/80 font-bold">{t('callerBadge')}</span>}
      </div>
      <div className="text-xs text-white/60 mb-2">{slot.buildLabel}</div>
      <div className="flex items-center gap-1.5">
        <UserCircle2 size={14} className="text-white/40 shrink-0" />
        <span className="text-sm font-medium truncate">{slot.assigned}</span>
      </div>
      <button
        onClick={onClear}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-white/40 hover:text-rose-400"
        aria-label={t('clearSlot')}
      >
        <X size={12} />
      </button>
    </div>
  )
}
