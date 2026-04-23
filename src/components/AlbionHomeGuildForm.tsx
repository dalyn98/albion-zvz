'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Loader2, Save, Search, Shield, Trash2 } from 'lucide-react'
import {
  searchAlbionGuildCandidates,
  type AlbionGuildCandidate,
} from '@/app/actions/onboarding'
import { updateAppSetting } from '@/app/actions/settings'
import type { AlbionServer } from '@/lib/albion-gameinfo'

interface Props {
  server: AlbionServer
  initialGuildId: string
}

const SEARCH_DEBOUNCE_MS = 300

export default function AlbionHomeGuildForm({ server, initialGuildId }: Props) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState<AlbionGuildCandidate[]>([])
  const [searching, setSearching] = useState(false)
  const [currentGuildId, setCurrentGuildId] = useState(initialGuildId)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
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

  const handleSelect = (candidate: AlbionGuildCandidate) => {
    setError('')
    setSaved(false)
    startTransition(async () => {
      const res = await updateAppSetting('albion_home_guild_id', candidate.id)
      if (res.error) {
        setError(res.error)
        return
      }
      setCurrentGuildId(candidate.id)
      setQuery('')
      setCandidates([])
      setSaved(true)
      router.refresh()
    })
  }

  const handleClear = () => {
    setError('')
    setSaved(false)
    startTransition(async () => {
      const res = await updateAppSetting('albion_home_guild_id', '')
      if (res.error) {
        setError(res.error)
        return
      }
      setCurrentGuildId('')
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
      <div className="flex items-start gap-2">
        <Shield size={16} className="text-amber-400 mt-0.5" />
        <div>
          <h2 className="font-bold text-white">홈 길드</h2>
          <p className="text-gray-500 text-xs mt-1 leading-relaxed">
            알비온 온보딩에서 &quot;우리 길드&quot; 로 인정할 Gameinfo 길드입니다. 비어 있으면 모든
            유저가 [미인증] 으로만 저장되어 인증 기능을 쓸 수 없습니다. 위에서 선택한 서버에서
            조회됩니다.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2.5">
        <p className="text-[11px] text-gray-500 uppercase tracking-wide">현재 설정</p>
        {currentGuildId ? (
          <p className="text-xs text-white font-mono break-all mt-1">{currentGuildId}</p>
        ) : (
          <p className="text-xs text-amber-300 mt-1">미설정 — 모든 온보딩이 [미인증] 으로 저장됩니다</p>
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
                onClick={() => handleSelect(c)}
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

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-3 py-2 text-red-300 text-xs">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3 pt-1">
        {currentGuildId && (
          <button
            type="button"
            onClick={handleClear}
            disabled={isPending}
            className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 px-3 py-2 rounded-lg text-xs transition-colors"
          >
            {isPending ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
            홈 길드 해제
          </button>
        )}
        {saved && (
          <span className="flex items-center gap-1 text-[11px] text-emerald-400">
            <Save size={12} /> 저장됨
          </span>
        )}
      </div>
    </div>
  )
}
