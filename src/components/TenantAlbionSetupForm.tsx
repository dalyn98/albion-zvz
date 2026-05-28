'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Loader2, Search, Trash2 } from 'lucide-react'
import {
  searchAlbionGuildCandidates,
  type AlbionGuildCandidate,
} from '@/app/actions/onboarding'
import { saveTenantAlbion } from '@/app/actions/onboard'
import { ALBION_SERVERS, type AlbionServer } from '@/lib/albion-gameinfo'
import { AODP_ALLOWED_CITIES, type AodpCity } from '@/lib/shop/aodp-constants'

interface Labels {
  albionServerLabel: string
  albionServerHelp: string
  albionHomeGuildLabel: string
  albionHomeGuildHelp: string
  albionGuildSearchPlaceholder: string
  albionGuildNoResults: string
  albionSelectedGuild: string
  albionClearGuild: string
  albionNoHomeGuild: string
  // 서버 라벨 — west/east/europe 모두 ALBION_SERVER_LABEL_KEY 매핑 기반.
  // 단일 진실 원천은 common 네임스페이스, 부모 RSC 에서 resolveServerLabel 로 풀어 전달.
  albionServerLabels: Record<AlbionServer, string>
  // 'gameinfo-sgp' 같은 hostname 힌트 — 서버를 시각적으로 구분하는 보조 정보.
  albionServerHints: Record<AlbionServer, string>
  albionServerSelectHint: string
  albionAodpCityLabel: string
  albionAodpCityHelp: string
  nextButton: string
  savingButton: string
  errorGeneric: string
}

interface Props {
  tenantId: string
  labels: Labels
}

const SEARCH_DEBOUNCE_MS = 300

// 위저드 2단계: 알비온 서버 + 홈 길드. 서버를 바꾸면 UUID 가 무효가 되므로 선택
// 길드를 초기화한다. 홈 길드는 이후 멤버 인증의 기준이라 최초 설정에서 필수다.
export default function TenantAlbionSetupForm({ tenantId, labels }: Props) {
  const router = useRouter()
  // 초기 서버 미선택 — 한 서버 (east) 를 default 로 박으면 west/eu 길드 사용자가
  // 폼을 그대로 제출해 잘못된 서버에 저장되는 사고. 명시적 클릭을 요구.
  const [server, setServer] = useState<AlbionServer | null>(null)
  const [guildId, setGuildId] = useState('')
  const [guildName, setGuildName] = useState('')
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState<AlbionGuildCandidate[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const [aodpCity, setAodpCity] = useState<AodpCity>(AODP_ALLOWED_CITIES[0])

  const latestRequestRef = useRef(0)
  useEffect(() => {
    // 서버 미선택 시 검색 자체 비활성 — 어느 서버에 쿼리할지 알 수 없다.
    if (!server || query.trim().length < 2) {
      // 빈 query / 서버 미선택 → 검색 결과 클리어. 외부 → 로컬 state 동기화.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCandidates([])
      setSearching(false)
      return
    }
    const reqId = ++latestRequestRef.current
    setSearching(true)
    const timer = setTimeout(async () => {
      const res = await searchAlbionGuildCandidates(server, query)
      if (reqId !== latestRequestRef.current) return
      setSearching(false)
      if (res.error) {
        setError(res.error)
        setCandidates([])
        return
      }
      setError('')
      setCandidates(res.candidates)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, server])

  const handleServerChange = (s: AlbionServer) => {
    if (s === server) return
    setServer(s)
    setGuildId('')
    setGuildName('')
    setCandidates([])
    setQuery('')
    setError('')
  }

  const handleSelectGuild = (candidate: AlbionGuildCandidate) => {
    setGuildId(candidate.id)
    setGuildName(candidate.name)
    setQuery('')
    setCandidates([])
    setError('')
  }

  const handleClearGuild = () => {
    setGuildId('')
    setGuildName('')
    setError('')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!server) return
    setError('')
    startTransition(async () => {
      const res = await saveTenantAlbion({
        tenantId,
        server,
        homeGuildId: guildId,
        homeGuildName: guildName,
        aodpCity,
      })
      if (res.error) {
        setError(res.error)
        return
      }
      router.push(`/onboard/setup/${tenantId}/rewards`)
    })
  }

  // ALBION_SERVERS 가 단일 진실 원천 — 서버 추가/제거 시 albion-gameinfo.ts 만 수정.
  const serverOptions: ReadonlyArray<{
    value: AlbionServer
    label: string
    hint: string
  }> = ALBION_SERVERS.map((value) => ({
    value,
    label: labels.albionServerLabels[value],
    hint: labels.albionServerHints[value],
  }))

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-white">
          {labels.albionServerLabel}
        </legend>
        <p className="text-xs text-gray-400">{labels.albionServerHelp}</p>
        {!server && (
          <p className="text-xs text-amber-300">{labels.albionServerSelectHint}</p>
        )}
        <div className="mt-2 space-y-1.5">
          {serverOptions.map((opt) => (
            <label
              key={opt.value}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer select-none transition-colors ${
                server === opt.value
                  ? 'border-[#5865F2] bg-[#5865F2]/10'
                  : 'border-white/10 bg-white/5 hover:border-white/20'
              }`}
            >
              <input
                type="radio"
                name="albion-server"
                value={opt.value}
                checked={server === opt.value}
                onChange={() => handleServerChange(opt.value)}
                className="accent-[#5865F2]"
              />
              <span className="flex-1">
                <span className="text-sm text-white font-semibold">{opt.label}</span>
                <span className="block text-[11px] text-gray-500 mt-0.5 font-mono">
                  {opt.hint}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-white">
          {labels.albionHomeGuildLabel}
        </legend>
        <p className="text-xs text-gray-400">{labels.albionHomeGuildHelp}</p>

        <div className="mt-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
          <p className="text-[11px] text-gray-500 uppercase tracking-wide">
            {labels.albionSelectedGuild}
          </p>
          {guildId ? (
            <div className="mt-1 flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                {guildName && (
                  <p className="text-sm text-white font-semibold truncate">{guildName}</p>
                )}
                <p className="text-xs text-gray-400 font-mono break-all">{guildId}</p>
              </div>
              <button
                type="button"
                onClick={handleClearGuild}
                disabled={isPending}
                className="flex-shrink-0 flex items-center gap-1 bg-white/5 hover:bg-white/10 disabled:opacity-50 text-gray-400 hover:text-gray-200 px-2 py-1 rounded text-[11px]"
              >
                <Trash2 size={11} /> {labels.albionClearGuild}
              </button>
            </div>
          ) : (
            <p className="text-xs text-amber-300 mt-1">{labels.albionNoHomeGuild}</p>
          )}
        </div>

        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={labels.albionGuildSearchPlaceholder}
            className="w-full bg-white/5 border border-white/10 focus:border-[#5865F2]/60 focus:ring-2 focus:ring-[#5865F2]/30 rounded-lg pl-9 pr-9 py-2.5 text-sm text-white placeholder:text-gray-500 outline-none"
          />
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
          />
          {searching && (
            <Loader2
              size={14}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 animate-spin"
            />
          )}
        </div>

        {candidates.length > 0 && (
          <ul className="space-y-1.5">
            {candidates.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => handleSelectGuild(c)}
                  disabled={isPending}
                  className="w-full flex items-center justify-between gap-2 bg-white/5 hover:bg-white/10 disabled:opacity-50 border border-white/10 hover:border-[#5865F2]/40 rounded-lg px-3 py-2.5 text-left transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white truncate">{c.name}</p>
                    <p className="text-[11px] text-gray-500 font-mono truncate">{c.id}</p>
                  </div>
                  <ChevronRight size={14} className="text-gray-500 flex-shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {query.trim().length >= 2 && !searching && candidates.length === 0 && !error && (
          <p className="text-xs text-gray-500 text-center py-2">
            {labels.albionGuildNoResults}
          </p>
        )}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-white">
          {labels.albionAodpCityLabel}
        </legend>
        <p className="text-xs text-gray-400">{labels.albionAodpCityHelp}</p>
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {AODP_ALLOWED_CITIES.map((c) => {
            const active = c === aodpCity
            return (
              <label
                key={c}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer select-none transition-colors ${
                  active
                    ? 'border-[#5865F2] bg-[#5865F2]/10'
                    : 'border-white/10 bg-white/5 hover:border-white/20'
                }`}
              >
                <input
                  type="radio"
                  name="onboard-aodp-city"
                  value={c}
                  checked={active}
                  onChange={() => setAodpCity(c)}
                  className="accent-[#5865F2]"
                />
                <span className="text-sm text-white">{c}</span>
              </label>
            )
          })}
        </div>
      </fieldset>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex items-center gap-2 pt-2">
        <button
          type="submit"
          disabled={isPending || !server || !guildId}
          className="flex-1 rounded-lg bg-[#5865F2] hover:bg-[#4752c4] disabled:opacity-60 text-white text-sm font-semibold py-2.5"
        >
          {isPending ? labels.savingButton : labels.nextButton}
        </button>
      </div>
    </form>
  )
}
