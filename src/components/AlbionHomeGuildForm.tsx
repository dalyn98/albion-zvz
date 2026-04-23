'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Globe2, Loader2, Save, Search, Shield, Trash2 } from 'lucide-react'
import {
  searchAlbionGuildCandidates,
  type AlbionGuildCandidate,
} from '@/app/actions/onboarding'
import { updateAlbionHomeGuild } from '@/app/actions/settings'
import type { AlbionServer } from '@/lib/albion-gameinfo'

interface Props {
  initialServer: AlbionServer
  initialGuildId: string
  initialGuildName?: string | null
}

const SEARCH_DEBOUNCE_MS = 300

const SERVER_OPTIONS: ReadonlyArray<{
  value: AlbionServer
  label: string
  hint: string
}> = [
  { value: 'east', label: 'East (Asia)', hint: 'gameinfo-sgp · 아시아 서버' },
  { value: 'west', label: 'West (Americas)', hint: 'gameinfo · 아메리카 서버' },
  { value: 'europe', label: 'Europe', hint: 'gameinfo-ams · 유럽 서버' },
]

// 서버 + 홈 길드를 한 폼에서 묶어 저장. 길드 UUID 는 서버별로 다르기 때문에 둘
// 이 어긋나면 온보딩 인증이 전부 실패한다. 그래서 두 값은 항상 같이 저장.
// 서버를 바꾸면 현재 선택된 길드는 무효(UUID 가 다른 서버 값이라 의미 없음)
// 이므로 초기화한다.
export default function AlbionHomeGuildForm({
  initialServer,
  initialGuildId,
  initialGuildName,
}: Props) {
  const router = useRouter()
  const [server, setServer] = useState<AlbionServer>(initialServer)
  const [guildId, setGuildId] = useState(initialGuildId)
  const [guildName, setGuildName] = useState(initialGuildName ?? '')
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState<AlbionGuildCandidate[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  const dirty = server !== initialServer || guildId !== initialGuildId

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
    // 서버가 바뀌면 현재 선택된 길드 UUID 는 이 서버에서 존재하지 않으므로 초기화.
    // 단, 새 서버가 우연히 initialServer 와 같다면(= 되돌린 경우) initialGuildId 복구.
    setGuildId(s === initialServer ? initialGuildId : '')
    setGuildName('')
    setCandidates([])
    setQuery('')
    setSaved(false)
    setError('')
  }

  const handleSelectGuild = (candidate: AlbionGuildCandidate) => {
    setGuildId(candidate.id)
    setGuildName(candidate.name)
    setQuery('')
    setCandidates([])
    setSaved(false)
    setError('')
  }

  const handleClearGuild = () => {
    setGuildId('')
    setGuildName('')
    setSaved(false)
    setError('')
  }

  const handleSave = () => {
    setError('')
    setSaved(false)
    startTransition(async () => {
      const res = await updateAlbionHomeGuild({ server, guildId })
      if (res.error) {
        setError(res.error)
        return
      }
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-5">
      <div className="flex items-start gap-2">
        <Shield size={16} className="text-amber-400 mt-0.5" />
        <div>
          <h2 className="font-bold text-white">홈 길드 · 알비온 서버</h2>
          <p className="text-gray-500 text-xs mt-1 leading-relaxed">
            알비온 온보딩과 킬보드 자동 검증에 쓸 서버와 &quot;우리 길드&quot;를 함께
            설정합니다. 길드 UUID 는 서버별로 다르기 때문에 두 값은 항상 쌍으로 저장됩니다.
            홈 길드가 비어 있으면 온보딩이 모두 [미인증]으로 저장됩니다.
          </p>
        </div>
      </div>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
          <Globe2 size={12} /> 서버
        </h3>
        {SERVER_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={`flex items-start gap-3 rounded-lg border px-3 py-2 cursor-pointer select-none transition-colors ${
              server === opt.value
                ? 'border-amber-500/60 bg-amber-500/10'
                : 'border-gray-700 hover:border-gray-600 bg-gray-800/30'
            }`}
          >
            <input
              type="radio"
              name="albion-home-guild-server"
              value={opt.value}
              checked={server === opt.value}
              onChange={() => handleServerChange(opt.value)}
              className="mt-1 accent-amber-500"
            />
            <span className="flex-1">
              <span className="text-sm text-white font-semibold">{opt.label}</span>
              <span className="block text-[11px] text-gray-500 mt-0.5 font-mono">{opt.hint}</span>
            </span>
          </label>
        ))}
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
          <Shield size={12} /> 홈 길드 (선택된 서버 기준)
        </h3>

        <div className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2.5">
          <p className="text-[11px] text-gray-500 uppercase tracking-wide">현재 선택</p>
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
                className="flex-shrink-0 flex items-center gap-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-400 hover:text-gray-200 px-2 py-1 rounded text-[11px]"
              >
                <Trash2 size={11} /> 해제
              </button>
            </div>
          ) : (
            <p className="text-xs text-amber-300 mt-1">
              미설정 — 저장하면 모든 온보딩이 [미인증]으로 저장됩니다
            </p>
          )}
        </div>

        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSaved(false)
            }}
            placeholder="길드명으로 검색 (2자 이상)"
            className="w-full bg-gray-950 border border-gray-800 focus:border-amber-500/60 rounded-lg pl-9 pr-9 py-2.5 text-sm text-white placeholder:text-gray-600 outline-none"
          />
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600"
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
                  className="w-full flex items-center justify-between gap-2 bg-gray-950 hover:bg-gray-900 disabled:opacity-50 border border-gray-900 hover:border-amber-500/30 rounded-lg px-3 py-2.5 text-left transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white truncate">{c.name}</p>
                    <p className="text-[11px] text-gray-600 font-mono truncate">{c.id}</p>
                  </div>
                  <ChevronRight size={14} className="text-gray-600 flex-shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {query.trim().length >= 2 && !searching && candidates.length === 0 && !error && (
          <p className="text-xs text-gray-500 text-center py-2">검색 결과 없음</p>
        )}
      </section>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-3 py-2 text-red-300 text-xs">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3 pt-1 border-t border-gray-800">
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || isPending}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-4 py-2 rounded-lg transition-colors text-sm"
        >
          {isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {isPending ? '저장 중…' : '저장'}
        </button>
        {saved && !dirty && (
          <span className="text-[11px] text-emerald-400">저장됨</span>
        )}
      </div>
    </div>
  )
}
