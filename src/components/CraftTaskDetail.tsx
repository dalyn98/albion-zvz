'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import {
  ArrowLeft,
  Calendar,
  Hammer,
  Package,
  User,
} from 'lucide-react'
import {
  claimCraftQueueItem,
  releaseCraftQueueItem,
  deliverCraftQueueItem,
  type CraftBoxConfig,
  type CraftCompensationMode,
  type CraftQueueTaskDetail,
  type CrafterProfile,
} from '@/app/actions/craft'
import { SLOT_KEYS, type BuildSnapshot, type SlotKey } from '@/types'
import { formatSilver } from '@/lib/silver'
import { getLocalizedItemNameWithEnchant } from '@/lib/item-names'
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n/locales'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import ItemImage from './ItemImage'
import { useToast } from './ToastProvider'

interface Props {
  detail: CraftQueueTaskDetail
  profile: CrafterProfile | null
  config: CraftBoxConfig
}

export default function CraftTaskDetail({ detail, profile, config }: Props) {
  const t = useTranslations('craftQueue')
  const tRole = useTranslations('slotRole')
  const router = useRouter()
  const rawLocale = useLocale()
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE
  const { task, event, isMine } = detail

  return (
    <>
      <header className="space-y-2">
        <Link
          href="/craft/queue"
          className="text-xs text-gray-400 hover:text-white inline-flex items-center gap-1"
        >
          <ArrowLeft size={12} /> {t('detailBackToQueue')}
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
              <Hammer size={20} className="text-amber-400" />
              {t('detailTitle')}
            </h1>
            <p className="text-gray-400 text-sm mt-1 truncate">{task.eventTitle}</p>
          </div>
          <StatusBadge status={task.status} t={t} />
        </div>
      </header>

      <Timeline task={task} t={t} />

      <InfoCard task={task} event={event} tRole={tRole} t={t} />

      <SlotsCard
        buildSnapshot={task.buildSnapshot}
        locale={locale}
        t={t}
      />

      <ActionsCard
        task={task}
        isMine={isMine}
        profile={profile}
        config={config}
        onAfter={() => router.refresh()}
      />
    </>
  )
}

function StatusBadge({
  status,
  t,
}: {
  status: CraftQueueTaskDetail['task']['status']
  t: ReturnType<typeof useTranslations>
}) {
  const map: Record<typeof status, { label: string; cls: string }> = {
    queued: {
      label: t('statusQueued'),
      cls: 'bg-gray-500/15 text-gray-300 border-gray-500/40',
    },
    claimed: {
      label: t('statusClaimed'),
      cls: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
    },
    delivered: {
      label: t('statusDelivered'),
      cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
    },
    collected: {
      label: t('statusCollected'),
      cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
    },
    expired: {
      label: t('statusExpired'),
      cls: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
    },
    cancelled: {
      label: t('statusCancelled'),
      cls: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
    },
  } as Record<typeof status, { label: string; cls: string }>
  const style = map[status]
  return (
    <span
      className={`text-[11px] font-bold rounded px-2 py-1 border whitespace-nowrap ${style.cls}`}
    >
      {style.label}
    </span>
  )
}

function Timeline({
  task,
  t,
}: {
  task: CraftQueueTaskDetail['task']
  t: ReturnType<typeof useTranslations>
}) {
  return (
    <ol className="bg-gray-900 border border-gray-700 rounded-2xl p-4 grid grid-cols-3 gap-2 text-center">
      <TimelineStep label={t('timelineRequested')} at={task.createdAt} active />
      <TimelineStep
        label={t('timelineClaimed')}
        at={task.claimedAt}
        active={task.claimedAt != null}
      />
      <TimelineStep
        label={t('timelineDelivered')}
        at={task.deliveredAt}
        active={task.deliveredAt != null}
      />
    </ol>
  )
}

function TimelineStep({
  label,
  at,
  active,
}: {
  label: string
  at: string | null
  active: boolean
}) {
  return (
    <li className="flex flex-col gap-1">
      <span
        className={`text-[10px] font-bold uppercase tracking-wider ${
          active ? 'text-amber-300' : 'text-gray-600'
        }`}
      >
        {label}
      </span>
      <span className="text-[11px] font-mono text-gray-300">
        {at ? formatDateTime(at) : '—'}
      </span>
    </li>
  )
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    const yy = String(d.getFullYear()).slice(2)
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const hh = String(d.getHours()).padStart(2, '0')
    const mi = String(d.getMinutes()).padStart(2, '0')
    return `${yy}/${mm}/${dd} ${hh}:${mi}`
  } catch {
    return iso
  }
}

function InfoCard({
  task,
  event,
  tRole,
  t,
}: {
  task: CraftQueueTaskDetail['task']
  event: CraftQueueTaskDetail['event']
  tRole: ReturnType<typeof useTranslations>
  t: ReturnType<typeof useTranslations>
}) {
  return (
    <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 space-y-3">
      <h2 className="text-[11px] text-gray-400 font-bold uppercase tracking-wider flex items-center gap-2">
        <Calendar size={12} /> {t('detailInfoTitle')}
      </h2>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
        <InfoRow label={t('detailInfoEvent')}>
          {event ? (
            <Link
              href={`/events/${event.id}`}
              className="text-amber-300 hover:text-amber-200 truncate"
            >
              {event.title}
            </Link>
          ) : (
            <span className="text-gray-300 truncate">{task.eventTitle}</span>
          )}
        </InfoRow>
        {event?.gatherAt && (
          <InfoRow label={t('detailInfoGatherAt')}>
            <span className="font-mono text-gray-300">{formatDateTime(event.gatherAt)}</span>
          </InfoRow>
        )}
        <InfoRow label={t('detailInfoRequester')}>
          <span className="text-gray-300 inline-flex items-center gap-1">
            <User size={12} /> {task.requesterUsername}
          </span>
        </InfoRow>
        <InfoRow label={t('detailInfoRole')}>
          <span className="text-gray-300">{translateSlotRole(task.roleName, tRole)}</span>
        </InfoRow>
        {task.claimedSilver != null && (
          <InfoRow label={t('detailInfoClaimedSilver')}>
            <span className="font-mono text-amber-300">{formatSilver(task.claimedSilver)}</span>
          </InfoRow>
        )}
        {task.crafterUsername && (
          <InfoRow label={t('detailInfoCrafter')}>
            <span className="text-gray-300">
              {task.crafterUsername}
              {task.compensationMode && (
                <span className="ml-2 text-[10px] text-gray-500">
                  ({task.compensationMode === 'paid' ? t('modePaid') : t('modeVolunteer')})
                </span>
              )}
            </span>
          </InfoRow>
        )}
      </dl>
    </section>
  )
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 sm:flex-col sm:items-start sm:gap-0.5">
      <dt className="text-[11px] text-gray-500 uppercase tracking-wider whitespace-nowrap">
        {label}
      </dt>
      <dd className="min-w-0 text-right sm:text-left flex-1 sm:flex-none truncate">{children}</dd>
    </div>
  )
}

function SlotsCard({
  buildSnapshot,
  locale,
  t,
}: {
  buildSnapshot: BuildSnapshot | null
  locale: Locale
  t: ReturnType<typeof useTranslations>
}) {
  const tGear = useTranslations('gear')
  const slots = useMemo(() => {
    if (!buildSnapshot) return []
    return SLOT_KEYS.flatMap((key) => {
      const item = buildSnapshot[key]
      if (!item || !item.id) return []
      const displayName =
        getLocalizedItemNameWithEnchant(item.id, locale, item.name) ?? item.id
      return [{ key, id: item.id, name: displayName }]
    })
  }, [buildSnapshot, locale])

  if (slots.length === 0) {
    return (
      <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4">
        <h2 className="text-[11px] text-gray-400 font-bold uppercase tracking-wider mb-2">
          {t('detailSlotsTitle')}
        </h2>
        <p className="text-gray-500 text-sm">{t('detailSlotsEmpty')}</p>
      </section>
    )
  }
  return (
    <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 space-y-3">
      <h2 className="text-[11px] text-gray-400 font-bold uppercase tracking-wider flex items-center gap-2">
        <Package size={12} /> {t('detailSlotsTitle')}
      </h2>
      <ul className="space-y-2">
        {slots.map((s) => (
          <li
            key={s.key}
            className="bg-gray-950 border border-gray-800 rounded-lg p-2 flex items-center gap-3"
          >
            <ItemImage itemId={s.id} itemName={s.name} size={36} hoverPreview />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">
                {tGear(s.key as SlotKey)}
              </p>
              <p className="text-sm text-white truncate" title={s.name}>
                {s.name}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ActionsCard({
  task,
  isMine,
  profile,
  config,
  onAfter,
}: {
  task: CraftQueueTaskDetail['task']
  isMine: boolean
  profile: CrafterProfile | null
  config: CraftBoxConfig
  onAfter: () => void
}) {
  if (task.status === 'queued') {
    return <ClaimSection task={task} profile={profile} onAfter={onAfter} />
  }
  if (task.status === 'claimed' && isMine) {
    return <DeliverSection task={task} config={config} onAfter={onAfter} />
  }
  if (task.status === 'delivered' || task.status === 'collected') {
    return <DeliveredSummary task={task} />
  }
  return null
}

function ClaimSection({
  task,
  profile,
  onAfter,
}: {
  task: CraftQueueTaskDetail['task']
  profile: CrafterProfile | null
  onAfter: () => void
}) {
  const t = useTranslations('craftQueue')
  const toast = useToast()
  const [mode, setMode] = useState<CraftCompensationMode>(profile?.compensationMode ?? 'volunteer')
  const [premiumPct, setPremiumPct] = useState(String(profile?.premiumPct ?? 0))
  const [pending, startTransition] = useTransition()

  const submit = () => {
    const parsed = Number(premiumPct)
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0 || parsed > 200) {
      toast.error(t('premiumOutOfRange'))
      return
    }
    startTransition(async () => {
      const r = await claimCraftQueueItem({
        taskId: task.taskId,
        compensationMode: mode,
        premiumPct: parsed,
      })
      if (r.error) {
        toast.error(r.error)
        return
      }
      toast.success(t('toastClaimed'))
      onAfter()
    })
  }

  return (
    <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 space-y-3">
      <h2 className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">
        {t('claimDialogTitle')}
      </h2>
      <p className="text-[11px] text-gray-500">{t('claimDialogHint')}</p>
      <div className="grid grid-cols-2 gap-2">
        {(['volunteer', 'paid'] as const).map((m) => {
          const active = mode === m
          return (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              disabled={pending}
              className={`text-left rounded-lg border px-3 py-2 disabled:opacity-50 ${
                active
                  ? 'border-amber-400 bg-amber-500/10 text-amber-200'
                  : 'border-gray-700 bg-gray-950 text-gray-300 hover:border-gray-500'
              }`}
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
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="w-full text-sm font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black rounded-lg px-4 py-2.5"
      >
        {pending ? t('claiming') : t('confirmClaim')}
      </button>
    </section>
  )
}

function DeliverSection({
  task,
  config,
  onAfter,
}: {
  task: CraftQueueTaskDetail['task']
  config: CraftBoxConfig
  onAfter: () => void
}) {
  const t = useTranslations('craftQueue')
  const toast = useToast()
  const router = useRouter()
  const [boxNumber, setBoxNumber] = useState('')
  const [materialCost, setMaterialCost] = useState('')
  const [releasing, startRelease] = useTransition()
  const [submitting, startSubmit] = useTransition()

  const handleRelease = () => {
    startRelease(async () => {
      const r = await releaseCraftQueueItem(task.taskId)
      if (r.error) {
        toast.error(r.error)
        return
      }
      toast.info(t('toastReleased'))
      router.push('/craft/queue')
    })
  }

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
        taskId: task.taskId,
        boxNumber: box,
        materialSilverCost: material,
      })
      if (r.error) {
        toast.error(r.error)
        return
      }
      toast.success(t('toastDelivered'))
      onAfter()
    })
  }

  const pending = releasing || submitting

  return (
    <section className="bg-gray-900 border border-amber-500/30 rounded-2xl p-4 space-y-3">
      <h2 className="text-[11px] text-amber-300 font-bold uppercase tracking-wider">
        {t('deliverDialogTitle')}
      </h2>
      <p className="text-[11px] text-gray-500">{t('deliverDialogHint')}</p>

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
          onClick={handleRelease}
          disabled={pending}
          className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-rose-500/40 rounded-lg px-3 py-2 disabled:opacity-50"
        >
          {releasing ? t('releasing') : t('releaseButton')}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="text-sm font-bold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black rounded-lg px-4 py-2"
        >
          {submitting ? t('delivering') : t('confirmDeliver')}
        </button>
      </div>
    </section>
  )
}

function DeliveredSummary({ task }: { task: CraftQueueTaskDetail['task'] }) {
  const t = useTranslations('craftQueue')
  return (
    <section className="bg-gray-900 border border-emerald-500/30 rounded-2xl p-4 space-y-2">
      <h2 className="text-[11px] text-emerald-300 font-bold uppercase tracking-wider">
        {t('detailDeliveredSummaryTitle')}
      </h2>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 rounded px-2 py-1 font-mono text-xs">
          {t('boxLabel', { n: task.boxNumber ?? 0 })}
        </span>
        {task.craftCity && <span className="text-gray-300">{task.craftCity}</span>}
        {task.craftFocusUsed && <span className="text-amber-300 text-xs">{t('detailFocusUsed')}</span>}
      </div>
      {task.materialSilverCost != null && (
        <p className="text-xs text-gray-400 font-mono">
          {t('materialSpent', { silver: formatSilver(task.materialSilverCost) })}
        </p>
      )}
    </section>
  )
}

