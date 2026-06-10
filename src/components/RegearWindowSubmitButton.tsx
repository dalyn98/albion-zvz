'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ArrowRight, ShieldCheck, X, Upload, Clipboard } from 'lucide-react'
import {
  requestWindowRegear,
  type RegearWindow,
  type WindowRoleOption,
} from '@/app/actions/regear-windows'
import { REGEAR_VERIFICATION_ERROR_PREFIX } from '@/lib/regear-verification'
import {
  canOpenManualRegearRequest,
  getDeathBatchEntryLimit,
  getInitialManualRegearPhase,
  isDeathLimitReached,
  type ManualRegearPhase,
} from '@/lib/regear-request-policy'
import { formatSilver, parseSilverInput } from '@/lib/silver'
import { calcPayoutSilver } from '@/lib/regear-payout'
import { compressImageIfLarge } from '@/lib/image-compress'
import { normalizeYoutubeVideoProofUrl } from '@/lib/regear-video-proof'
import { resolveRegearClaimCeilingSilver } from '@/lib/regear-claim-ceiling'
import { useToast } from './ToastProvider'
import { RequestTypePicker, VideoProofField, type RequestType } from './RegearRequestModalParts'
import { translateSlotRole } from '@/lib/slot-role-i18n'

interface Props {
  window: RegearWindow
  roleOptions: WindowRoleOption[]
  payoutRatePercent: number
  videoPayoutRatePercent: number
  videoClaimCeilingRatePercent: number
  existingActiveCount: number
  craftEnabled: boolean
  craftIncludeCapeDefault: boolean
  overchargeEnabled: boolean
}

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const REGEAR_VERIFY_HREF = '/onboarding/albion?return=%2Fregear'

interface EntryState {
  id: string
  file: File | null
  file2: File | null
  claimedInput: string
}

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

export default function RegearWindowSubmitButton({
  window: w,
  roleOptions,
  payoutRatePercent,
  videoPayoutRatePercent,
  videoClaimCeilingRatePercent,
  existingActiveCount,
  craftEnabled,
  craftIncludeCapeDefault,
  overchargeEnabled,
}: Props) {
  const router = useRouter()
  const t = useTranslations('regear')
  const tWin = useTranslations('regearWindow')
  const tRole = useTranslations('slotRole')
  const tToast = useTranslations('toast')
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [roleName, setRoleName] = useState<string>(roleOptions[0]?.roleName ?? '')
  // 한 신청 batch 에서 최대로 입력할 수 있는 데스 수. 제품 batch 한도와
  // 1인당 잔여 데스 한도 중 작은 쪽. 오버차지는 이 한도를 쓰지 않는다.
  const maxEntries = getDeathBatchEntryLimit(existingActiveCount, w.maxDeathsPerMember)
  const initialPhase = getInitialManualRegearPhase(overchargeEnabled, maxEntries)
  const [phase, setPhase] = useState<ManualRegearPhase>(initialPhase)
  const [requestType, setRequestType] = useState<RequestType>('death')
  const [craftIncludeCape, setCraftIncludeCape] = useState(craftIncludeCapeDefault)
  const [entries, setEntries] = useState<EntryState[]>(() =>
    initialPhase === 'entries' ? [newEntry()] : [],
  )
  const [videoUrl, setVideoUrl] = useState('')
  const [videoError, setVideoError] = useState('')
  const [entryErrors, setEntryErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [needsVerification, setNeedsVerification] = useState(false)
  const [pending, startTransition] = useTransition()
  // paste 핸들러가 entries 의 latest 값을 읽도록 ref 동기화. effect 에서 갱신.
  const entriesRef = useRef(entries)
  useEffect(() => {
    entriesRef.current = entries
  })
  // hover 중인 슬롯: paste 시 우선 채움. 없으면 위→아래 첫 빈 슬롯.
  const hoveredSlotRef = useRef<{ entryId: string; slot: 'primary' | 'secondary' } | null>(null)

  const selectedReward = roleOptions.find((o) => o.roleName === roleName)?.silver ?? 0
  const deathLimitReached = isDeathLimitReached(existingActiveCount, w.maxDeathsPerMember)
  const canSubmit = canOpenManualRegearRequest({
    baseEnabled: w.isOpen && roleOptions.length > 0,
    activeDeathCount: existingActiveCount,
    maxDeaths: w.maxDeathsPerMember,
    overchargeEnabled,
  })
  const ceilingMissing = selectedReward <= 0
  const videoProofRaw = videoUrl.trim()
  const normalizedVideoProofUrl = videoProofRaw ? normalizeYoutubeVideoProofUrl(videoProofRaw) : null
  const hasValidVideoProof = videoProofRaw.length > 0 && normalizedVideoProofUrl !== null
  const effectiveSelectedReward = resolveRegearClaimCeilingSilver({
    baseCeilingSilver: selectedReward,
    videoCeilingRatePercent: videoClaimCeilingRatePercent,
    hasVideoProof: hasValidVideoProof,
  })

  const reset = () => {
    const initialRole = roleOptions[0]?.roleName ?? ''
    setRoleName(initialRole)
    setPhase(initialPhase)
    setRequestType('death')
    setCraftIncludeCape(craftIncludeCapeDefault)
    setEntries(initialPhase === 'entries' ? [newEntry()] : [])
    setVideoUrl('')
    setVideoError('')
    setEntryErrors({})
    setError('')
    setNeedsVerification(false)
  }

  const updateEntry = (id: string, patch: Partial<EntryState>) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  }

  const pickDeathCount = (count: number) => {
    setEntries(createEntries(count))
    setVideoUrl('')
    setVideoError('')
    setEntryErrors({})
    setError('')
    setNeedsVerification(false)
    setPhase('entries')
  }

  const pickRequestType = (type: RequestType) => {
    if (type === 'death' && deathLimitReached) return
    setRequestType(type)
    setVideoUrl('')
    setVideoError('')
    setEntryErrors({})
    setError('')
    setNeedsVerification(false)
    if (type === 'overcharge') {
      setEntries(createEntries(1))
      setPhase('entries')
      return
    }
    if (maxEntries <= 1) {
      setEntries(createEntries(1))
      setPhase('entries')
      return
    }
    setPhase('count')
  }

  const backToCount = () => {
    setEntries([])
    setVideoUrl('')
    setVideoError('')
    setEntryErrors({})
    setError('')
    setNeedsVerification(false)
    setPhase('count')
  }

  const backToType = () => {
    setEntries([])
    setVideoUrl('')
    setVideoError('')
    setEntryErrors({})
    setError('')
    setNeedsVerification(false)
    setPhase('type')
  }

  const backFromEntries = () => {
    if (overchargeEnabled && (requestType === 'overcharge' || maxEntries <= 1)) {
      backToType()
      return
    }
    backToCount()
  }

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

  // paste: hover 슬롯 우선, 폴백은 row-by-row 첫 빈 슬롯
  // (entry[0].primary → entry[0].secondary → entry[1].primary → ...).
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
          e.preventDefault()
          compressImageIfLarge(pasted).then((compressed) => {
            const patch: Partial<EntryState> =
              hover.slot === 'primary' ? { file: compressed } : { file2: compressed }
            updateEntry(hover.entryId, patch)
            setEntryErrors((prev) => {
              if (!(hover.entryId in prev)) return prev
              const next = { ...prev }
              delete next[hover.entryId]
              return next
            })
          })
          return
        }
        let target: { entryId: string; slot: 'primary' | 'secondary' } | null = null
        for (const entry of latest) {
          if (!entry.file) {
            target = { entryId: entry.id, slot: 'primary' }
            break
          }
          if (!entry.file2) {
            target = { entryId: entry.id, slot: 'secondary' }
            break
          }
        }
        if (!target) return
        const finalTarget = target
        e.preventDefault()
        compressImageIfLarge(pasted).then((compressed) => {
          const patch: Partial<EntryState> =
            finalTarget.slot === 'primary' ? { file: compressed } : { file2: compressed }
          updateEntry(finalTarget.entryId, patch)
          setEntryErrors((prev) => {
            if (!(finalTarget.entryId in prev)) return prev
            const next = { ...prev }
            delete next[finalTarget.entryId]
            return next
          })
        })
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
    if (!roleName) {
      setError(t('ceilingNotSet'))
      return
    }
    if (entries.length === 0) {
      setError(t('screenshotMissing'))
      return
    }
    const validated: { entry: EntryState; parsedClaim: number }[] = []
    const nextErrors: Record<string, string> = {}
    const videoProofUrl = normalizedVideoProofUrl
    if (videoProofRaw && !videoProofUrl) {
      setVideoError(t('videoProofInvalid'))
      return
    }
    const requiredMessage =
      requestType === 'overcharge' ? t('allOverchargeEntriesRequired') : t('allEntriesRequired')
    for (const entry of entries) {
      const hasFile = entry.file !== null
      const hasClaim = entry.claimedInput.trim().length > 0
      if (!hasFile || !hasClaim) {
        nextErrors[entry.id] = requiredMessage
        continue
      }
      const parsed = parseSilverInput(entry.claimedInput)
      if (parsed === null || parsed <= 0) {
        nextErrors[entry.id] = t('claimInvalid')
        continue
      }
      if (parsed > effectiveSelectedReward) {
        nextErrors[entry.id] = t('claimOverCeiling', { ceiling: formatSilver(effectiveSelectedReward) })
        continue
      }
      validated.push({ entry, parsedClaim: parsed })
    }
    if (Object.keys(nextErrors).length > 0) {
      setEntryErrors(nextErrors)
      return
    }
    setEntryErrors({})
    setVideoError('')
    setError('')
    setNeedsVerification(false)
    startTransition(async () => {
      const results: { id: string; error?: string }[] = []
      let verificationMessage: string | null = null
      // 서버 한도 (max_deaths_per_member) 는 한 호출 단위로 카운트하므로
      // 직렬 await 로 보낸다. 멤버가 한도를 N>잔여 만큼 골랐어도 서버가
      // 잔여 초과 시점부터 reject 하고, 그 시점의 entry 들은 errMap 에
      // 남는다 (partial success 처리).
      for (const { entry, parsedClaim } of validated) {
        const form = new FormData()
        form.append('windowId', w.id)
        form.append('roleName', roleName)
        form.append('claimedSilver', parsedClaim.toString())
        form.append('screenshot', entry.file!)
        if (videoProofUrl) {
          form.append('videoProofUrl', videoProofUrl)
        }
        form.append('requestType', requestType)
        if (craftEnabled) {
          form.append('craftIncludeCape', craftIncludeCape ? 'true' : 'false')
        }
        if (entry.file2) form.append('screenshot2', entry.file2)
        const r = await requestWindowRegear(form)
        if (r.error && r.error.startsWith(REGEAR_VERIFICATION_ERROR_PREFIX)) {
          // 인증 미완료는 후속 entry 도 동일 사유로 막힐 것 — 멈추고 CTA 표출
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
        reset()
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

  const buttonLabel = !w.isOpen
    ? tWin('btnClosed')
    : deathLimitReached
      ? overchargeEnabled
        ? tWin('btnOverchargeOnly')
        : tWin('btnDone')
      : tWin('btnSubmit')

  return (
    <>
      <button
        type="button"
        onClick={() => {
          reset()
          setOpen(true)
        }}
        disabled={!canSubmit}
        className="flex items-center gap-1.5 text-xs font-medium text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-lg px-3 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <ShieldCheck size={13} />
        {buttonLabel}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center sm:p-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="regear-window-modal-title"
            className="bg-gray-900 border border-gray-700 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[92dvh] flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
              <h3 id="regear-window-modal-title" className="font-bold text-white text-base truncate pr-2">
                {tWin('modalTitle', { title: w.title })}
              </h3>
              <button
                type="button"
                onClick={() => !pending && setOpen(false)}
                className="p-1 text-gray-400 hover:text-white shrink-0"
                aria-label={t('close')}
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 text-sm">
              {roleOptions.length === 0 ? (
                <p className="text-rose-300 text-xs">{t('ceilingNotSet')}</p>
              ) : (
                <>
                  <FulfillmentModeNotice
                    craftEnabled={craftEnabled}
                    includeCape={craftIncludeCape}
                    onIncludeCapeChange={setCraftIncludeCape}
                  />

                  <div>
                    <label htmlFor="rw-modal-role" className="block text-xs text-gray-400 mb-1">
                      {t('role')}
                    </label>
                    <select
                      id="rw-modal-role"
                      value={roleName}
                      onChange={(e) => setRoleName(e.target.value)}
                      disabled={pending}
                      className="w-full rounded-md bg-gray-950 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-400"
                    >
                      {roleOptions.map((opt) => (
                        <option key={opt.roleName} value={opt.roleName}>
                          {translateSlotRole(opt.roleName, tRole)} · {formatSilver(opt.silver)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {phase === 'type' ? (
                    <RequestTypePicker onPick={pickRequestType} deathDisabled={deathLimitReached} />
                  ) : phase === 'count' ? (
                    <DeathCountPicker maxEntries={maxEntries} onPick={pickDeathCount} />
                  ) : (
                    <>
                      {(overchargeEnabled || maxEntries > 1) && (
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-gray-400 text-[11px]">
                            {requestType === 'overcharge'
                              ? t('typeOverchargeLabel')
                              : t('deathCountOption', { n: entries.length })}
                          </p>
                          <button
                            type="button"
                            onClick={backFromEntries}
                            disabled={pending}
                            className="text-[11px] text-gray-500 hover:text-amber-400 disabled:opacity-50"
                          >
                            {overchargeEnabled && (requestType === 'overcharge' || maxEntries <= 1)
                              ? t('typeBack')
                              : t('deathCountBack')}
                          </button>
                        </div>
                      )}
                      <VideoProofField
                        id="regear-window-video-proof"
                        value={videoUrl}
                        onChange={(value) => {
                          setVideoUrl(value)
                          if (videoError) setVideoError('')
                        }}
                        videoPayoutRatePercent={videoPayoutRatePercent}
                        error={videoError}
                        disabled={pending}
                      />
                      <div className="space-y-5">
                        {entries.map((entry, idx) => (
                          <RegearEntryRow
                            key={entry.id}
                            entry={entry}
                            index={idx}
                            roleReward={effectiveSelectedReward}
                            ceilingMissing={ceilingMissing}
                            payoutRatePercent={payoutRatePercent}
                            videoPayoutRatePercent={videoPayoutRatePercent}
                            hasValidVideoProof={hasValidVideoProof}
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
                </>
              )}

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2 text-xs text-red-300 space-y-1">
                  <p>{error}</p>
                  {needsVerification && (
                    <Link
                      href={REGEAR_VERIFY_HREF}
                      className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-2.5 py-1.5 text-[11px] font-bold text-black hover:bg-amber-400"
                    >
                      <ShieldCheck size={12} />
                      {t('verifyCtaLabel')}
                      <ArrowRight size={12} />
                    </Link>
                  )}
                </div>
              )}
            </div>
            {phase === 'entries' && (
              <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-700">
                <button
                  type="button"
                  onClick={() => !pending && setOpen(false)}
                  disabled={pending}
                  className="px-3 py-1.5 text-sm text-gray-400 hover:text-white disabled:opacity-50"
                >
                  {t('cancel')}
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={pending || roleOptions.length === 0 || (requestType === 'death' && deathLimitReached)}
                  className="px-4 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 disabled:bg-amber-700/50 disabled:cursor-not-allowed text-sm font-bold text-black"
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
  videoPayoutRatePercent: number
  hasValidVideoProof: boolean
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
  videoPayoutRatePercent,
  hasValidVideoProof,
  error,
  showHeader,
  onSlotHover,
  onChange,
}: RegearEntryRowProps) {
  const t = useTranslations('regear')
  const parsedClaim = parseSilverInput(entry.claimedInput)
  const effectivePayoutRatePercent = hasValidVideoProof ? videoPayoutRatePercent : payoutRatePercent

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
              {parsedClaim <= roleReward &&
                (effectivePayoutRatePercent < 100 || hasValidVideoProof) && (
                <span className="text-emerald-400 ml-2 font-mono">
                  {t('expectedPayout', {
                    amount: formatSilver(calcPayoutSilver(parsedClaim, effectivePayoutRatePercent)),
                    rate: effectivePayoutRatePercent,
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
  const inputId = `regear-window-screenshot-${entryId}-${slot}`

  useEffect(() => {
    if (!file) {
      // file 해제 → preview 비우기. URL.createObjectURL cleanup 패턴.
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
            compressImageIfLarge(dropped).then(onChange)
          }
        }}
        className={`flex flex-col items-center justify-center gap-2 w-full rounded-lg cursor-pointer transition-colors overflow-hidden ${
          previewUrl
            ? 'bg-gray-800 border border-gray-700 hover:border-amber-500'
            : `bg-gray-800 border border-dashed ${dragging ? 'border-amber-500 text-amber-400' : 'border-gray-600 hover:border-amber-500 text-gray-400 hover:text-amber-400'} py-5`
        }`}
      >
        {previewUrl ? (
          // blob: URL.createObjectURL 기반 미리보기 — Next Image 가 다루지 못함.
          // eslint-disable-next-line @next/next/no-img-element
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
          if (!picked) {
            onChange(null)
            return
          }
          compressImageIfLarge(picked).then(onChange)
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

interface FulfillmentModeNoticeProps {
  craftEnabled: boolean
  includeCape?: boolean
  onIncludeCapeChange?: (includeCape: boolean) => void
}

function FulfillmentModeNotice({
  craftEnabled,
  includeCape,
  onIncludeCapeChange,
}: FulfillmentModeNoticeProps) {
  const t = useTranslations('regear')
  const label = craftEnabled ? t('modeCraftedLabel') : t('modeSilverLabel')
  const hint = craftEnabled ? t('modeCraftedHint') : t('modeSilverHint')
  return (
    <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-3 space-y-1">
      <p className="text-amber-300 text-[11px] font-semibold">{t('modeNoticeLabel')}</p>
      <p className="text-xs font-bold text-amber-200">{label}</p>
      <p className="text-[10px] text-gray-400 leading-relaxed">{hint}</p>
      {craftEnabled && includeCape != null && onIncludeCapeChange && (
        <label className="mt-2 flex items-start gap-2 rounded-lg border border-gray-700 bg-gray-950/60 px-2.5 py-2">
          <input
            type="checkbox"
            checked={includeCape}
            onChange={(e) => onIncludeCapeChange(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span className="min-w-0">
            <span className="block text-[11px] font-semibold text-gray-200">
              {t('craftIncludeCapeLabel')}
            </span>
            <span className="block text-[10px] text-gray-500 leading-relaxed">
              {t('craftIncludeCapeHint')}
            </span>
          </span>
        </label>
      )}
    </div>
  )
}
