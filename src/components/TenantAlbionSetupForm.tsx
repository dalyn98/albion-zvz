'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Loader2, Search, Trash2 } from 'lucide-react'
import {
  searchAlbionGuildCandidates,
  type AlbionGuildCandidate,
} from '@/app/actions/onboarding'
import { saveTenantAlbion } from '@/app/actions/onboard'
import type { AlbionServer } from '@/lib/albion-gameinfo'

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
  albionServerWest: string
  albionServerEast: string
  albionServerEurope: string
  nextButton: string
  skipButton: string
  savingButton: string
  errorGeneric: string
}

interface Props {
  tenantId: string
  labels: Labels
}

const SEARCH_DEBOUNCE_MS = 300

// 위저드 2단계: 알비온 서버 + 홈 길드. 서버를 바꾸면 UUID 가 무효가 되므로 선택
// 길드를 초기화한다. 홈 길드는 건너뛸 수 있지만 empty 로 저장된다는 점을 UI 에
// 명시한다 — 나중에 설정 페이지에서 복구 가능.
export default function TenantAlbionSetupForm({ tenantId, labels }: Props) {
  const router = useRouter()
  const [server, setServer] = useState<AlbionServer>('east')
  const [guildId, setGuildId] = useState('')
  const [guildName, setGuildName] = useState('')
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState<AlbionGuildCandidate[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const latestRequestRef = useRef(0)
  useEffect(() => {
    if (query.trim().length < 2) {
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
    setError('')
    startTransition(async () => {
      const res = await saveTenantAlbion({
        tenantId,
        server,
        homeGuildId: guildId,
      })
      if (res.error) {
        setError(res.error)
        return
      }
      router.push(`/onboard/setup/${tenantId}/rewards`)
    })
  }

  const serverOptions: ReadonlyArray<{
    value: AlbionServer
    label: string
    hint: string
  }> = [
    { value: 'east', label: labels.albionServerEast, hint: 'gameinfo-sgp' },
    { value: 'west', label: labels.albionServerWest, hint: 'gameinfo' },
    { value: 'europe', label: labels.albionServerEurope, hint: 'gameinfo-ams' },
  ]

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-white">
          {labels.albionServerLabel}
        </legend>
        <p className="text-xs text-gray-400">{labels.albionServerHelp}</p>
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

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex items-center gap-2 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 rounded-lg bg-[#5865F2] hover:bg-[#4752c4] disabled:opacity-60 text-white text-sm font-semibold py-2.5"
        >
          {isPending ? labels.savingButton : labels.nextButton}
        </button>
      </div>
    </form>
  )
}
