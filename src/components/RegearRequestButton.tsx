'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ShieldCheck, X, ArrowRight } from 'lucide-react'
import { requestRegear } from '@/app/actions/regear'
import { REGEAR_VERIFICATION_ERROR_PREFIX } from '@/lib/regear-verification'
import {
  canOpenManualRegearRequest,
  getDeathBatchEntryLimit,
  getInitialManualRegearPhase,
  getRemainingDeathClaims,
  isDeathLimitReached,
  type ManualRegearPhase,
} from '@/lib/regear-request-policy'
import { formatSilver, parseSilverInput } from '@/lib/silver'
import { compressImageIfLarge } from '@/lib/image-compress'
import { useToast } from './ToastProvider'
import {
  ACCEPTED_TYPES,
  DeathCountPicker,
  FulfillmentModeNotice,
  RegearEntryRow,
  RequestTypePicker,
  type EntryState,
  type RequestType,
} from './RegearRequestModalParts'

const REGEAR_VERIFY_HREF = '/onboarding/albion?return=%2Fregear'

interface Props {
  eventId: string
  roleName: string | null
  roleReward: number
  eventRegearDisabled?: boolean
  existingActiveCount: number
  maxDeaths: number
  // Current payout rate (1..100). If <100 we surface an "expected payout"
  // hint so the member isn't surprised when the credited amount differs from
  // their claim.
  payoutRatePercent: number
  // ISO 시각: 신청 오픈 시점. 서버에서 min(battle_started_at + windowMinutes,
  // matched ended_at) 으로 사전 계산해서 박는다 — 즉 전투 시작 후
  // windowMinutes 가 지나거나 전투가 종료되면 그 시점 부터 신청 가능.
  // 이 시점 이전엔 button disabled + 모달에서 안내.
  windowOpenAt: string
  // 길드 설정 regear_window_minutes (기본 60). UI 에 규칙 안내 ("전투 시작
  // 후 {minutes}분 또는 전투 종료 시점 중 빠른 쪽") 표시에 사용.
  windowMinutes: number
  // 길드 모드. true 면 모든 신규 요청이 'crafted' 로 강제, false 면 'silver'.
  // 멤버는 모드를 선택할 수 없고, UI 에는 안내 배너로만 표시된다.
  craftEnabled: boolean
  // 길드 정책: 오버차지 리기어 허용 여부. true 면 모달 시작 phase 에서
  // "전투 사망" / "오버차지" 종류를 먼저 고르고, false 면 그 phase 를 건너뛰어
  // 항상 'death' 로 처리한다.
  overchargeEnabled: boolean
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

function formatWindowOpen(iso: string): string {
  // KST (UTC+9, no DST). Extract HH:mm by shifting into UTC+9.
  const shifted = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000)
  return `${String(shifted.getUTCHours()).padStart(2, '0')}:${String(shifted.getUTCMinutes()).padStart(2, '0')}`
}

export default function RegearRequestButton({
  eventId,
  roleName,
  roleReward,
  eventRegearDisabled = false,
  existingActiveCount,
  maxDeaths,
  payoutRatePercent,
  windowOpenAt,
  windowMinutes,
  craftEnabled,
  overchargeEnabled,
}: Props) {
  const router = useRouter()
  const t = useTranslations('regear')
  const tToast = useTranslations('toast')
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const roleMissing = !roleName
  const ceilingMissing = !eventRegearDisabled && roleReward <= 0
  const deathLimitReached = isDeathLimitReached(existingActiveCount, maxDeaths)
  const remaining = getRemainingDeathClaims(existingActiveCount, maxDeaths)
  // Cap the choices by both the product limit and whatever deaths the user has
  // left on this event. Overcharge skips this count entirely.
  const maxEntries = getDeathBatchEntryLimit(existingActiveCount, maxDeaths)
  // overcharge 비활성 길드는 종류 선택 phase 자체를 건너뛰고, 1건만 가능하면
  // 자유 리기어와 동일하게 count picker 도 건너뛰어 바로 입력 폼을 연다.
  const initialPhase = getInitialManualRegearPhase(overchargeEnabled, maxEntries)
  const [phase, setPhase] = useState<ManualRegearPhase>(initialPhase)
  const [requestType, setRequestType] = useState<RequestType>('death')
  const [entries, setEntries] = useState<EntryState[]>(() =>
    initialPhase === 'entries' ? [newEntry()] : [],
  )
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

  // Client-side "waiting for killboard" check. Server re-validates; this is
  // just to keep the button from opening a modal that will error on submit.
  const windowOpenMs = new Date(windowOpenAt).getTime()
  // 윈도우 시작 시각 클라이언트 체크 — 서버가 권위, 여긴 UX 가드일 뿐.
  // 다음 인터랙션 시 재평가되면 충분하므로 render purity 위배는 의도된 가드.
  // eslint-disable-next-line react-hooks/purity
  const windowPending = Number.isFinite(windowOpenMs) && Date.now() < windowOpenMs
  const disabled = !canOpenManualRegearRequest({
    baseEnabled: !eventRegearDisabled && !roleMissing && !ceilingMissing && !windowPending,
    activeDeathCount: existingActiveCount,
    maxDeaths,
    overchargeEnabled,
  })
  const buttonLabel = windowPending
    ? t('buttonWindowPending', { opensAt: formatWindowOpen(windowOpenAt) })
    : eventRegearDisabled
      ? t('buttonEventDisabled')
    : roleMissing
      ? t('buttonRoleMissing')
      : ceilingMissing
      ? t('buttonCeilingMissing')
      : deathLimitReached
        ? overchargeEnabled
          ? t('buttonOverchargeOnly')
          : t('buttonDone')
        : maxDeaths > 1 && existingActiveCount > 0
          ? t('buttonRequestRemaining', { remaining })
          : t('buttonRequest')

  const updateEntry = (id: string, patch: Partial<EntryState>) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  }

  const resetModal = () => {
    setPhase(initialPhase)
    setRequestType('death')
    setEntries(initialPhase === 'entries' ? [newEntry()] : [])
    setEntryErrors({})
    setError('')
    setNeedsVerification(false)
  }

  const pickRequestType = (type: RequestType) => {
    if (type === 'death' && deathLimitReached) return
    setRequestType(type)
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

  const backFromEntries = () => {
    if (overchargeEnabled && (requestType === 'overcharge' || maxEntries <= 1)) {
      backToType()
      return
    }
    backToCount()
  }

  const backToType = () => {
    setEntries([])
    setEntryErrors({})
    setError('')
    setNeedsVerification(false)
    setPhase('type')
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
    if (entries.length === 0) {
      setError(t('screenshotMissing'))
      return
    }
    const validated: { entry: EntryState; parsedClaim: number }[] = []
    const nextErrors: Record<string, string> = {}
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
        form.append('requestType', requestType)
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
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">{t('windowOpensAt')}</span>
                  <span className="text-gray-200 font-mono text-xs">{formatWindowOpen(windowOpenAt)}</span>
                </div>
                <div className="text-[11px] text-gray-500 leading-snug">
                  {t('windowRule', { minutes: windowMinutes })}
                </div>
                {maxDeaths > 1 && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">{t('deathsRemaining')}</span>
                    <span className="text-gray-200 font-mono text-xs">
                      {t('deathsRemainingValue', { remaining, max: maxDeaths })}
                    </span>
                  </div>
                )}
              </div>

              {phase === 'type' ? (
                <RequestTypePicker onPick={pickRequestType} deathDisabled={deathLimitReached} />
              ) : phase === 'count' ? (
                <>
                  {overchargeEnabled && (
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-gray-500">
                        {requestType === 'overcharge'
                          ? t('typeOverchargeLabel')
                          : t('typeDeathLabel')}
                      </span>
                      <button
                        type="button"
                        onClick={backToType}
                        className="text-[11px] text-gray-500 hover:text-amber-400"
                      >
                        {t('typeBack')}
                      </button>
                    </div>
                  )}
                  <DeathCountPicker maxEntries={maxEntries} onPick={pickDeathCount} />
                </>
              ) : (
                <>
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
                  <FulfillmentModeNotice craftEnabled={craftEnabled} />
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
                  href={REGEAR_VERIFY_HREF}
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
