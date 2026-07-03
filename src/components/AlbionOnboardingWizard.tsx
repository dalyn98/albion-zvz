'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  Check,
  ChevronRight,
  Globe,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import {
  searchAlbionPlayerCandidates,
  confirmAlbionIdentity,
  setAlbionIdentityManually,
  type AlbionPlayerCandidate,
} from '@/app/actions/onboarding'
import { ALBION_SERVERS, ALBION_SERVER_LABEL_KEY, type AlbionServer } from '@/lib/albion-gameinfo'
import type { MemberAlbionIdentity } from '@/lib/albion-identity'
import { useToast } from './ToastProvider'

interface Props {
  discordNickname: string
  initialIdentity: MemberAlbionIdentity | null
  initialAllianceEventAllowed?: boolean
  homeGuildConfigured: boolean
  returnTo: string
  // 모달 variant 에서 주입. 넘기면 기본 router.replace(returnTo) 대신 이
  // 콜백만 실행 — 모달이 스스로 닫거나 refresh 할 수 있게.
  onFinish?: () => void
}

type Step = 'server' | 'search' | 'done'
type CompletionStatus = 'trusted' | 'alliance' | 'needs_review' | 'duplicate_review' | 'unverified'

const SEARCH_DEBOUNCE_MS = 300

const SERVER_HINT_KEY: Record<AlbionServer, 'serverHintEast' | 'serverHintWest' | 'serverHintEurope'> = {
  east: 'serverHintEast',
  west: 'serverHintWest',
  europe: 'serverHintEurope',
}

export default function AlbionOnboardingWizard({
  discordNickname,
  initialIdentity,
  initialAllianceEventAllowed = false,
  homeGuildConfigured,
  returnTo,
  onFinish,
}: Props) {
  const t = useTranslations('albionOnboarding')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const toast = useToast()

  const [step, setStep] = useState<Step>(() => {
    if (initialIdentity?.verifiedAt) return 'done'
    if (initialAllianceEventAllowed) return 'done'
    if (initialIdentity?.server) return 'search'
    return 'server'
  })
  const [server, setServer] = useState<AlbionServer | null>(initialIdentity?.server ?? null)
  const [query, setQuery] = useState<string>(initialIdentity?.nickname ?? discordNickname)
  const [candidates, setCandidates] = useState<AlbionPlayerCandidate[]>([])
  const [searching, setSearching] = useState(false)
  const [isPending, startTransition] = useTransition()
  // confirm/manual 직후 UI 에 인증 결과를 즉시 반영하기 위한 state. 초기 방문
  // 시에는 initialIdentity 로부터 파생, 이후엔 액션 응답으로 덮어씀.
  const [finalStatus, setFinalStatus] = useState<CompletionStatus | null>(
    initialIdentity?.verifiedAt
      ? 'trusted'
      : initialAllianceEventAllowed
        ? 'alliance'
        : initialIdentity?.server
          ? 'unverified'
          : null,
  )
  const hasExistingIdentity = Boolean(
    initialIdentity?.server || initialIdentity?.playerId || initialIdentity?.nickname,
  )

  // debounce 검색어 → /search 호출. query 나 server 가 바뀔 때마다 재실행.
  const latestRequestRef = useRef(0)
  useEffect(() => {
    if (step !== 'search' || !server || query.trim().length < 2) {
      // 검색 조건 미달 시 결과 클리어 — 외부 (step/server/query) → 로컬 state 동기화.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCandidates([])
      return
    }
    const reqId = ++latestRequestRef.current
    setSearching(true)
    const timer = setTimeout(async () => {
      const res = await searchAlbionPlayerCandidates(server, query)
      if (reqId !== latestRequestRef.current) return
      setSearching(false)
      if (res.error) {
        toast.error(res.error)
        setCandidates([])
        return
      }
      setCandidates(res.candidates)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, server, step, toast])

  const handleSelectServer = (s: AlbionServer) => {
    setServer(s)
    setStep('search')
  }

  const confirmIdentityReplacement = (nextPlayerId: string | null, nextName: string) => {
    if (!hasExistingIdentity) return true
    if (nextPlayerId && initialIdentity?.playerId === nextPlayerId) return true
    if (!nextPlayerId && initialIdentity?.nickname?.trim().toLowerCase() === nextName.toLowerCase()) {
      return true
    }
    return window.confirm(
      t('changeConfirm', {
        current: initialIdentity?.nickname ?? discordNickname,
        next: nextName,
      }),
    )
  }

  const handleConfirm = (candidate: AlbionPlayerCandidate) => {
    if (!server) return
    if (!confirmIdentityReplacement(candidate.id, candidate.name)) return
    startTransition(async () => {
      const res = await confirmAlbionIdentity({ server, playerId: candidate.id })
      if (res.error) {
        toast.error(res.error)
        return
      }
      if (res.trusted) {
        toast.success(t('toastVerified'))
        if (res.discordNicknameSyncFailed) {
          toast.info(t('toastNicknameSyncFailed'), 7000)
        }
        setFinalStatus('trusted')
      } else if (res.allianceEventAllowed) {
        toast.success(t('toastAlliance'))
        setFinalStatus('alliance')
      } else if (res.duplicateClaim) {
        toast.success(t('toastDuplicateClaim'))
        setFinalStatus('duplicate_review')
      } else if (res.needsReview) {
        toast.success(t('toastNeedsReview'))
        setFinalStatus('needs_review')
      } else {
        toast.error(t('toastUnverified'))
        setFinalStatus('unverified')
      }
      setStep('done')
      router.refresh()
    })
  }

  const handleManual = () => {
    if (!server) return
    const nickname = query.trim()
    if (nickname.length < 2) {
      toast.error(t('manualNicknameTooShort'))
      return
    }
    if (!confirmIdentityReplacement(null, nickname)) return
    startTransition(async () => {
      const res = await setAlbionIdentityManually({ server, nickname })
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(t('toastManualSaved'))
      setFinalStatus('unverified')
      setStep('done')
      router.refresh()
    })
  }

  const handleFinish = () => {
    if (onFinish) {
      onFinish()
      return
    }
    router.replace(returnTo)
    router.refresh()
  }

  const handleChangeCharacter = () => {
    latestRequestRef.current += 1
    setCandidates([])
    setSearching(false)
    setStep(server ? 'search' : 'server')
  }

  return (
    <div className="space-y-4">
      {!homeGuildConfigured && step !== 'done' && (
        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs rounded-lg p-3">
          <ShieldAlert size={14} className="flex-shrink-0 mt-0.5" />
          <span>{t('homeGuildNotConfigured')}</span>
        </div>
      )}

      {step === 'server' && (
        <section className="space-y-3">
          <header className="space-y-1">
            <h2 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
              <Globe size={14} /> {t('stepServer')}
            </h2>
            <p className="text-xs text-gray-500 leading-relaxed">{t('stepServerHelp')}</p>
          </header>
          <div className="space-y-2">
            {ALBION_SERVERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handleSelectServer(s)}
                className="w-full flex items-center justify-between bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-amber-500/40 rounded-lg px-4 py-3.5 text-left transition-colors"
              >
                <span className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-base font-semibold text-white">
                    {tCommon(ALBION_SERVER_LABEL_KEY[s])}
                  </span>
                  <span className="text-[11px] text-gray-500 leading-snug">
                    {t(SERVER_HINT_KEY[s])}
                  </span>
                </span>
                <ChevronRight size={16} className="text-gray-600 flex-shrink-0" />
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 'search' && server && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
              <Search size={14} /> {t('stepSearch', { server: tCommon(ALBION_SERVER_LABEL_KEY[server]) })}
            </h2>
            <button
              type="button"
              onClick={() => setStep('server')}
              className="text-xs text-gray-500 hover:text-gray-300"
            >
              {t('backToServer')}
            </button>
          </div>

          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full bg-gray-900 border border-gray-800 focus:border-amber-500/60 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder:text-gray-600 outline-none"
              autoFocus
            />
            {searching && (
              <Loader2
                size={14}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 animate-spin"
              />
            )}
          </div>

          <ul className="space-y-1.5">
            {candidates.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => handleConfirm(c)}
                  disabled={isPending}
                  className="w-full flex items-center justify-between gap-2 bg-gray-950 hover:bg-gray-900 disabled:opacity-50 border border-gray-900 hover:border-amber-500/30 rounded-lg px-3 py-2.5 text-left transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white truncate">{c.name}</p>
                    <p className="text-[11px] text-gray-500 truncate">
                      {c.guildName ? `[${c.guildName}]` : t('noGuild')}
                      {c.allianceName && <span className="ml-1">· {c.allianceName}</span>}
                      <span className="ml-2 font-mono text-gray-600">
                        KF {c.killFame.toLocaleString()}
                      </span>
                    </p>
                  </div>
                  <ChevronRight size={14} className="text-gray-600 flex-shrink-0" />
                </button>
              </li>
            ))}
            {query.trim().length >= 2 && !searching && candidates.length === 0 && (
              <li className="text-xs text-gray-500 text-center py-3">{t('noCandidates')}</li>
            )}
          </ul>

          <div className="pt-3 border-t border-gray-900 space-y-2">
            <p className="text-[11px] text-gray-500 leading-relaxed">{t('manualHint')}</p>
            <button
              type="button"
              onClick={handleManual}
              disabled={isPending || query.trim().length < 2}
              className="w-full flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 border border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-300"
            >
              {isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              {t('manualAction', { nickname: query.trim() || '—' })}
            </button>
          </div>
        </section>
      )}

      {step === 'done' && (
        <DoneView
          status={finalStatus ?? 'unverified'}
          onFinish={handleFinish}
          onChangeCharacter={handleChangeCharacter}
        />
      )}
    </div>
  )
}

interface DoneViewProps {
  status: CompletionStatus
  onFinish: () => void
  onChangeCharacter: () => void
}

function DoneView({ status, onFinish, onChangeCharacter }: DoneViewProps) {
  const t = useTranslations('albionOnboarding')
  const verified = status === 'trusted'
  const alliance = status === 'alliance'
  const needsReview = status === 'needs_review'
  const duplicateReview = status === 'duplicate_review'
  return (
    <section className="space-y-4">
      <div
        className={`rounded-lg p-4 border ${
          verified
            ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
            : alliance
              ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-200'
            : needsReview || duplicateReview
              ? 'bg-sky-500/10 border-sky-500/40 text-sky-200'
            : 'bg-yellow-500/10 border-yellow-500/40 text-yellow-200'
        }`}
      >
        <div className="flex items-center gap-2 font-semibold text-sm mb-1">
          {verified ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />}
          {verified
            ? t('doneVerifiedTitle')
            : alliance
              ? t('doneAllianceTitle')
            : duplicateReview
              ? t('doneDuplicateClaimTitle')
            : needsReview
              ? t('doneNeedsReviewTitle')
              : t('doneUnverifiedTitle')}
        </div>
        <p className="text-xs leading-relaxed opacity-90">
          {verified
            ? t('doneVerifiedDescription')
            : alliance
              ? t('doneAllianceDescription')
            : duplicateReview
              ? t('doneDuplicateClaimDescription')
            : needsReview
              ? t('doneNeedsReviewDescription')
              : t('doneUnverifiedDescription')}
        </p>
      </div>
      <div className="space-y-2">
        <button
          type="button"
          onClick={onFinish}
          className="w-full bg-amber-500 hover:bg-amber-400 text-gray-950 font-semibold rounded-lg px-4 py-2.5 text-sm"
        >
          {t('finish')}
        </button>
        <button
          type="button"
          onClick={onChangeCharacter}
          className="w-full flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-amber-500/40 text-gray-200 font-semibold rounded-lg px-4 py-2.5 text-sm"
        >
          <RefreshCw size={14} />
          {t('changeCharacter')}
        </button>
      </div>
    </section>
  )
}
