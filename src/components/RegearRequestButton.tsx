'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ShieldCheck, X, Upload, Clipboard, ArrowRight } from 'lucide-react'
import { requestRegear } from '@/app/actions/regear'
import { REGEAR_VERIFICATION_ERROR_PREFIX } from '@/lib/regear-verification'
import { formatSilver, parseSilverInput } from '@/lib/silver'
import { calcPayoutSilver } from '@/lib/regear-payout'
import { useToast } from './ToastProvider'

interface Props {
  eventId: string
  roleName: string | null
  roleReward: number
  existingActiveCount: number
  maxDeaths: number
  windowMinutes: number
  // Current payout rate (1..100). If <100 we surface an "expected payout"
  // hint so the member isn't surprised when the credited amount differs from
  // their claim.
  payoutRatePercent: number
  battleStartedAt: string | null
}

interface EntryState {
  id: string
  file: File | null
  file2: File | null
  claimedInput: string
}

type Phase = 'count' | 'entries'

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_ENTRIES = 3

function newEntry(): EntryState {
  return {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    file: null,
    file2: null,
    claimedInput: '',
  }
}

function createEntries(count: number): EntryState[] {
  return Array.from({ length: count }, () => newEntry())
}

function formatWindowOpen(iso: string, windowMinutes: number): string {
  const openMs = new Date(iso).getTime() + windowMinutes * 60 * 1000
  // KST (UTC+9, no DST). Extract HH:mm by shifting into UTC+9.
  const shifted = new Date(openMs + 9 * 60 * 60 * 1000)
  return `${String(shifted.getUTCHours()).padStart(2, '0')}:${String(shifted.getUTCMinutes()).padStart(2, '0')}`
}

export default function RegearRequestButton({
  eventId,
  roleName,
  roleReward,
  existingActiveCount,
  maxDeaths,
  windowMinutes,
  payoutRatePercent,
  battleStartedAt,
}: Props) {
  const router = useRouter()
  const t = useTranslations('regear')
  const tToast = useTranslations('toast')
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>('count')
  const [entries, setEntries] = useState<EntryState[]>([])
  const [entryErrors, setEntryErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  // 알비온 닉네임 인증이 필요해 서버가 차단한 경우 true. UI 는 에러 대신
  // 온보딩 CTA 를 노출한다. 닫기/뒤로 가기/입력 변경 시 초기화.
  const [needsVerification, setNeedsVerification] = useState(false)
  const [pending, startTransition] = useTransition()
  // paste 핸들러가 entries 의 현재 값을 항상 참조할 수 있게 ref 동기화.
  // useEffect 의 deps 에 entries 를 넣으면 setState → 리스너 재등록 사이에
  // 클로저 정합성이 깨질 수 있고, 다중 데스 입력 시 paste 가 첫 번째 슬롯
  // 이후로 동작하지 않는 버그가 보고됨. ref 로 latest 를 읽도록 변경.
  // 렌더 중 ref 쓰기는 react-compiler 가 금지하므로 effect 에서 갱신.
  const entriesRef = useRef(entries)
  useEffect(() => {
    entriesRef.current = entries
  })
  // 마우스가 hover 한 슬롯. 붙여넣기 시 이 슬롯에 우선 채운다 — 없으면
  // 위에서부터 첫 빈 슬롯 폴백. ref 라 hover 변경에 리렌더 안 함.
  const hoveredSlotRef = useRef<{ entryId: string; slot: 'primary' | 'secondary' } | null>(null)

  const notStarted = !battleStartedAt
  const ceilingMissing = roleReward <= 0
  const atLimit = existingActiveCount >= maxDeaths
  const remaining = Math.max(0, maxDeaths - existingActiveCount)
  // Cap the choices by both the product limit (3) and whatever deaths
  // the user has left on this event.
  const maxEntries = Math.max(1, Math.min(MAX_ENTRIES, remaining))
  // Client-side "waiting for killboard" check. Server re-validates; this is
  // just to keep the button from opening a modal that will error on submit.
  const windowOpenMs = battleStartedAt
    ? new Date(battleStartedAt).getTime() + windowMinutes * 60 * 1000
    : null
  const windowPending = windowOpenMs !== null && Date.now() < windowOpenMs
  const disabled = atLimit || !roleName || notStarted || ceilingMissing || windowPending
  const buttonLabel = atLimit
    ? t('buttonDone')
    : notStarted
      ? t('buttonNotStarted')
      : windowPending && battleStartedAt
        ? t('buttonWindowPending', { opensAt: formatWindowOpen(battleStartedAt, windowMinutes) })
        : ceilingMissing
          ? t('buttonCeilingMissing')
          : maxDeaths > 1 && existingActiveCount > 0
            ? t('buttonRequestRemaining', { remaining })
            : t('buttonRequest')

  const updateEntry = (id: string, patch: Partial<EntryState>) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  }

  const resetModal = () => {
    setPhase('count')
    setEntries([])
    setEntryErrors({})
    setError('')
    setNeedsVerification(false)
  }

  const pickDeathCount = (count: number) => {
    setEntries(createEntries(count))
    setEntryErrors({})
    setError('')
    setNeedsVerification(false)
    setPhase('entries')
  }

  const backToCount = () => {
    setEntries([])
    setEntryErrors({})
    setError('')
    setNeedsVerification(false)
    setPhase('count')
  }

  // 모달 a11y: ESC 로 닫기 + body scroll lock. 제출 중(pending)엔 ESC 무시
  // — 진행 중인 업로드가 끊겼다고 오해할 여지를 피함.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, pending])

  // Paste handler: 마우스가 올라가 있는 슬롯에 우선 붙여넣는다 (overwrite 포함).
  // hover 가 없으면 row-by-row 첫 빈 슬롯 폴백 — entry[0].primary →
  // entry[0].secondary → entry[1].primary → entry[1].secondary.
  // ref 사용으로 entries 변경 시 리스너 재등록 없이 latest 를 읽는다.
  useEffect(() => {
    if (!open || phase !== 'entries') return
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.kind !== 'file') continue
        if (!ACCEPTED_TYPES.includes(item.type)) continue
        const blob = item.getAsFile()
        if (!blob) continue
        const ext = item.type.split('/')[1]
        const pasted = new File([blob], `clipboard-${Date.now()}.${ext}`, { type: item.type })
        const latest = entriesRef.current
        const hover = hoveredSlotRef.current
        if (hover && latest.some((en) => en.id === hover.entryId)) {
          const patch: Partial<EntryState> =
            hover.slot === 'primary' ? { file: pasted } : { file2: pasted }
          updateEntry(hover.entryId, patch)
          setEntryErrors((prev) => {
            if (!(hover.entryId in prev)) return prev
            const next = { ...prev }
            delete next[hover.entryId]
            return next
          })
          e.preventDefault()
          return
        }
        for (const entry of latest) {
          if (!entry.file) {
            updateEntry(entry.id, { file: pasted })
            setEntryErrors((prev) => {
              if (!(entry.id in prev)) return prev
              const next = { ...prev }
              delete next[entry.id]
              return next
            })
            e.preventDefault()
            return
          }
          if (!entry.file2) {
            updateEntry(entry.id, { file2: pasted })
            e.preventDefault()
            return
          }
        }
        return
      }
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [open, phase])

  const handleSlotHover = (entryId: string, slot: 'primary' | 'secondary' | null) => {
    hoveredSlotRef.current = slot ? { entryId, slot } : null
  }

  const submit = () => {
    if (ceilingMissing) {
      setError(t('ceilingNotSet'))
      return
    }
    if (entries.length === 0) {
      setError(t('screenshotMissing'))
      return
    }
    const validated: { entry: EntryState; parsedClaim: number }[] = []
    const nextErrors: Record<string, string> = {}
    for (const entry of entries) {
      const hasFile = entry.file !== null
      const hasClaim = entry.claimedInput.trim().length > 0
      if (!hasFile || !hasClaim) {
        nextErrors[entry.id] = t('allEntriesRequired')
        continue
      }
      const parsed = parseSilverInput(entry.claimedInput)
      if (parsed === null || parsed <= 0) {
        nextErrors[entry.id] = t('claimInvalid')
        continue
      }
      if (parsed > roleReward) {
        nextErrors[entry.id] = t('claimOverCeiling', { ceiling: formatSilver(roleReward) })
        continue
      }
      validated.push({ entry, parsedClaim: parsed })
    }
    if (Object.keys(nextErrors).length > 0) {
      setEntryErrors(nextErrors)
      return
    }
    setEntryErrors({})
    setError('')
    setNeedsVerification(false)
    startTransition(async () => {
      const results: { id: string; error?: string }[] = []
      let verificationMessage: string | null = null
      for (const { entry, parsedClaim } of validated) {
        const form = new FormData()
        form.append('eventId', eventId)
        form.append('screenshot', entry.file!)
        if (entry.file2) {
          form.append('screenshot2', entry.file2)
        }
        form.append('claimedSilver', parsedClaim.toString())
        const r = await requestRegear(form)
        if (r.error && r.error.startsWith(REGEAR_VERIFICATION_ERROR_PREFIX)) {
          // 후속 entry 도 동일 사유로 실패할 것 — 남은 요청은 보내지 않고
          // 인증 CTA 를 띄운다. 이미 성공한 entry 는 그대로 유지.
          verificationMessage = r.error.slice(REGEAR_VERIFICATION_ERROR_PREFIX.length)
          break
        }
        results.push({ id: entry.id, error: r.error })
      }
      if (verificationMessage !== null) {
        const succeededIds = new Set(
          results.filter((r) => !r.error).map((r) => r.id),
        )
        setEntries((prev) => prev.filter((e) => !succeededIds.has(e.id)))
        setEntryErrors({})
        setError(verificationMessage)
        setNeedsVerification(true)
        router.refresh()
        return
      }
      const succeededIds = new Set(results.filter((r) => !r.error).map((r) => r.id))
      const failed = results.filter((r) => r.error)
      if (failed.length === 0) {
        setOpen(false)
        resetModal()
        toast.success(
          succeededIds.size === 1
            ? tToast('regearSubmitted')
            : tToast('regearSubmittedMulti', { count: succeededIds.size }),
        )
      } else {
        setEntries((prev) => prev.filter((e) => !succeededIds.has(e.id)))
        const errMap: Record<string, string> = {}
        for (const r of failed) errMap[r.id] = r.error ?? ''
        setEntryErrors(errMap)
        if (succeededIds.size > 0) {
          toast.info(
            tToast('regearSubmittedPartial', {
              success: succeededIds.size,
              total: validated.length,
            }),
          )
        }
      }
      router.refresh()
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          resetModal()
          setOpen(true)
        }}
        disabled={disabled}
        className="flex items-center gap-1.5 text-xs font-medium text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-lg px-3 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <ShieldCheck size={13} />
        {buttonLabel}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center sm:p-6"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="regear-modal-title"
            className="bg-gray-900 border border-gray-700 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[92dvh] flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
              <h3 id="regear-modal-title" className="font-bold text-white text-base">{t('modalTitle')}</h3>
              <button
                type="button"
                onClick={() => !pending && setOpen(false)}
                className="p-1 text-gray-400 hover:text-white"
                aria-label={t('close')}
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 text-sm">
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">{t('role')}</span>
                  <span className="text-white font-semibold">{roleName ?? t('unassigned')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">{t('roleCeiling')}</span>
                  <span className="text-amber-400 font-mono font-semibold">{formatSilver(roleReward)}</span>
                </div>
                {battleStartedAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">{t('windowOpensAt')}</span>
                    <span className="text-gray-200 font-mono text-xs">{formatWindowOpen(battleStartedAt, windowMinutes)}</span>
                  </div>
                )}
                {maxDeaths > 1 && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">{t('deathsRemaining')}</span>
                    <span className="text-gray-200 font-mono text-xs">
                      {t('deathsRemainingValue', { remaining, max: maxDeaths })}
                    </span>
                  </div>
                )}
              </div>

              {phase === 'count' ? (
                <DeathCountPicker
                  maxEntries={maxEntries}
                  onPick={pickDeathCount}
                />
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-gray-400 text-[11px]">
                      {t('deathCountOption', { n: entries.length })}
                    </p>
                    <button
                      type="button"
                      onClick={backToCount}
                      disabled={pending}
                      className="text-[11px] text-gray-500 hover:text-amber-400 disabled:opacity-50"
                    >
                      {t('deathCountBack')}
                    </button>
                  </div>
                  <div className="space-y-5">
                    {entries.map((entry, idx) => (
                      <RegearEntryRow
                        key={entry.id}
                        entry={entry}
                        index={idx}
                        roleReward={roleReward}
                        ceilingMissing={ceilingMissing}
                        payoutRatePercent={payoutRatePercent}
                        error={entryErrors[entry.id] ?? ''}
                        showHeader={entries.length > 1}
                        onSlotHover={handleSlotHover}
                        onChange={(patch) => {
                          updateEntry(entry.id, patch)
                          if (entryErrors[entry.id]) {
                            setEntryErrors((prev) => {
                              const next = { ...prev }
                              delete next[entry.id]
                              return next
                            })
                          }
                        }}
                      />
                    ))}
                  </div>
                </>
              )}

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                  <p className="text-red-400 text-xs">{error}</p>
                </div>
              )}
              {needsVerification && (
                <Link
                  href="/onboarding/albion"
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm rounded-lg px-4 py-2.5"
                >
                  <ShieldCheck size={14} />
                  {t('verifyCtaLabel')}
                  <ArrowRight size={14} />
                </Link>
              )}
            </div>
            {phase === 'entries' && (
              <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-700">
                <button
                  type="button"
                  onClick={() => !pending && setOpen(false)}
                  disabled={pending}
                  className="text-gray-400 hover:text-white text-sm px-3 py-2"
                >
                  {t('cancel')}
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={pending}
                  className="bg-rose-500 hover:bg-rose-400 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-lg text-sm"
                >
                  {pending ? t('submitting') : t('submit')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

interface DeathCountPickerProps {
  maxEntries: number
  onPick: (count: number) => void
}

function DeathCountPicker({ maxEntries, onPick }: DeathCountPickerProps) {
  const t = useTranslations('regear')
  const options = Array.from({ length: maxEntries }, (_, i) => i + 1)
  return (
    <div className="space-y-3">
      <div>
        <p className="text-white text-base font-semibold">{t('deathCountQuestion')}</p>
        <p className="text-gray-400 text-[11px] mt-1 leading-relaxed">
          {t('deathCountDescription')}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {options.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onPick(n)}
            className="flex flex-col items-center justify-center rounded-lg border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-200 font-bold py-4 transition-colors"
          >
            <span className="text-2xl">{n}</span>
            <span className="text-[10px] font-medium text-rose-300/80 mt-0.5">
              {t('deathCountOption', { n })}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

interface RegearEntryRowProps {
  entry: EntryState
  index: number
  roleReward: number
  ceilingMissing: boolean
  payoutRatePercent: number
  error: string
  showHeader: boolean
  onSlotHover: (entryId: string, slot: 'primary' | 'secondary' | null) => void
  onChange: (patch: Partial<EntryState>) => void
}

function RegearEntryRow({
  entry,
  index,
  roleReward,
  ceilingMissing,
  payoutRatePercent,
  error,
  showHeader,
  onSlotHover,
  onChange,
}: RegearEntryRowProps) {
  const t = useTranslations('regear')
  const parsedClaim = parseSilverInput(entry.claimedInput)

  return (
    <div className="space-y-2 border-l-2 border-rose-500/30 pl-3">
      {showHeader && (
        <div className="flex items-center">
          <span className="text-amber-400 text-[11px] font-semibold">
            {t('entryLabel', { n: index + 1 })}
          </span>
        </div>
      )}

      <div>
        <label className="text-gray-400 text-[11px] font-semibold block mb-1">
          {t('claimAmount', { max: formatSilver(roleReward) })}
        </label>
        <input
          type="text"
          inputMode="numeric"
          placeholder={t('claimPlaceholder')}
          value={entry.claimedInput}
          onChange={(e) => onChange({ claimedInput: e.target.value })}
          disabled={ceilingMissing}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-base text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 font-mono disabled:opacity-50"
        />
        {ceilingMissing ? (
          <p className="text-red-400 text-[11px] mt-1">{t('ceilingNotSet')}</p>
        ) : (
          parsedClaim !== null && (
            <p className="text-gray-500 text-[11px] mt-1">
              {t('claimAmountPrefix')}{' '}
              <span className="font-mono text-gray-300">
                {t('claimAmountWithUnit', { amount: formatSilver(parsedClaim) })}
              </span>
              {parsedClaim > roleReward && (
                <span className="text-red-400 ml-2">{t('overCeiling')}</span>
              )}
              {parsedClaim <= roleReward && payoutRatePercent < 100 && (
                <span className="text-emerald-400 ml-2 font-mono">
                  {t('expectedPayout', {
                    amount: formatSilver(calcPayoutSilver(parsedClaim, payoutRatePercent)),
                    rate: payoutRatePercent,
                  })}
                </span>
              )}
            </p>
          )
        )}
      </div>

      <ScreenshotSlot
        entryId={entry.id}
        slot="primary"
        label={t('screenshotPrimaryLabel')}
        file={entry.file}
        onChange={(file) => onChange({ file })}
        onHover={(active) => onSlotHover(entry.id, active ? 'primary' : null)}
      />

      <ScreenshotSlot
        entryId={entry.id}
        slot="secondary"
        label={t('screenshotSecondaryLabel')}
        file={entry.file2}
        onChange={(file) => onChange({ file2: file })}
        onHover={(active) => onSlotHover(entry.id, active ? 'secondary' : null)}
      />

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-400 text-xs">{error}</p>
        </div>
      )}
    </div>
  )
}

interface ScreenshotSlotProps {
  entryId: string
  slot: 'primary' | 'secondary'
  label: string
  file: File | null
  onChange: (file: File | null) => void
  onHover: (active: boolean) => void
}

function ScreenshotSlot({ entryId, slot, label, file, onChange, onHover }: ScreenshotSlotProps) {
  const t = useTranslations('regear')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputId = `regear-screenshot-${entryId}-${slot}`

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  return (
    <div onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)}>
      <label className="text-gray-400 text-[11px] font-semibold block mb-1">{label}</label>
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const dropped = e.dataTransfer.files?.[0]
          if (dropped && ACCEPTED_TYPES.includes(dropped.type)) {
            onChange(dropped)
          }
        }}
        className={`flex flex-col items-center justify-center gap-2 w-full rounded-lg cursor-pointer transition-colors overflow-hidden ${
          previewUrl
            ? 'bg-gray-800 border border-gray-700 hover:border-amber-500'
            : `bg-gray-800 border border-dashed ${dragging ? 'border-amber-500 text-amber-400' : 'border-gray-600 hover:border-amber-500 text-gray-400 hover:text-amber-400'} py-5`
        }`}
      >
        {previewUrl ? (
          <img src={previewUrl} alt={t('screenshotAlt')} className="max-h-48 w-auto object-contain" />
        ) : (
          <>
            <Upload size={16} />
            <span className="text-xs">{t('pickOrPaste')}</span>
            <span className="inline-flex items-center gap-1 text-[10px] text-gray-500">
              <Clipboard size={10} />
              {t('pasteHint')}
            </span>
          </>
        )}
      </label>
      <input
        id={inputId}
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0] ?? null
          onChange(picked)
        }}
      />
      {file && (
        <div className="flex items-center justify-between gap-2 mt-2 text-xs">
          <span className="text-gray-400 truncate flex-1" title={file.name}>
            {file.name}
          </span>
          <button
            type="button"
            onClick={() => {
              onChange(null)
              if (fileInputRef.current) fileInputRef.current.value = ''
            }}
            className="text-gray-500 hover:text-red-400 flex-shrink-0"
          >
            {t('remove')}
          </button>
        </div>
      )}
    </div>
  )
}
