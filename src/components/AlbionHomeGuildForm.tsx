'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  AlertTriangle,
  ChevronRight,
  Globe2,
  Loader2,
  Lock,
  Save,
  Search,
  Shield,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import {
  searchAlbionGuildCandidates,
  type AlbionGuildCandidate,
} from '@/app/actions/onboarding'
import { updateAlbionHomeGuild } from '@/app/actions/settings'
import type { AlbionServer } from '@/lib/albion-gameinfo'
import { useReportDirty } from './UnsavedChangesProvider'

interface Props {
  initialServer: AlbionServer
  initialGuildId: string
  initialGuildName?: string | null
  embedded?: boolean
  // 홈 길드 잠금 상태 (mig-less, app_settings 기반).
  // - editable=false: 일반 admin 이 이미 설정된 홈 길드를 보는 상태 — 읽기 전용.
  // - editable=true + showFirstTimeWarning=true: 초기 설정. 변경 불가 경고 노출.
  // - editable=true + isSuperAdmin=true: 슈퍼어드민 우회 모드. 슈퍼어드민 배지 표시.
  editable?: boolean
  showFirstTimeWarning?: boolean
  isSuperAdmin?: boolean
}

const SEARCH_DEBOUNCE_MS = 300

const SERVER_OPTIONS: ReadonlyArray<{
  value: AlbionServer
  labelKey: 'serverEastLabel' | 'serverWestLabel' | 'serverEuropeLabel'
  hintKey: 'serverEastHint' | 'serverWestHint' | 'serverEuropeHint'
}> = [
  { value: 'east', labelKey: 'serverEastLabel', hintKey: 'serverEastHint' },
  { value: 'west', labelKey: 'serverWestLabel', hintKey: 'serverWestHint' },
  { value: 'europe', labelKey: 'serverEuropeLabel', hintKey: 'serverEuropeHint' },
]

// 서버 + 홈 길드를 한 폼에서 묶어 저장. 길드 UUID 는 서버별로 다르기 때문에 둘
// 이 어긋나면 온보딩 인증이 전부 실패한다. 그래서 두 값은 항상 같이 저장.
// 서버를 바꾸면 현재 선택된 길드는 무효(UUID 가 다른 서버 값이라 의미 없음)
// 이므로 초기화한다.
export default function AlbionHomeGuildForm({
  initialServer,
  initialGuildId,
  initialGuildName,
  embedded = false,
  editable = true,
  showFirstTimeWarning = false,
  isSuperAdmin = false,
}: Props) {
  const router = useRouter()
  const tc = useTranslations('common')
  const t = useTranslations('adminAlbionHomeGuild')
  const [server, setServer] = useState<AlbionServer>(initialServer)
  const [guildId, setGuildId] = useState(initialGuildId)
  const [guildName, setGuildName] = useState(initialGuildName ?? '')
  // 저장 직후 saved* sync — router.refresh 동안의 false-alarm 차단.
  const [savedServer, setSavedServer] = useState<AlbionServer>(initialServer)
  const [savedGuildId, setSavedGuildId] = useState(initialGuildId)
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState<AlbionGuildCandidate[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  const dirty = server !== savedServer || guildId !== savedGuildId
  useReportDirty('albion-home-guild', editable && dirty)

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
      setSavedServer(server)
      setSavedGuildId(guildId)
      setSaved(true)
      router.refresh()
    })
  }

  const containerClass = embedded
    ? 'space-y-4'
    : 'bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-5'

  if (!editable) {
    return (
      <div className={containerClass}>
        <div className="flex items-start gap-2">
          {!embedded && <Shield size={16} className="text-amber-400 mt-0.5" />}
          <div>
            {embedded ? (
              <h3 className="font-semibold text-white text-sm">{t('title')}</h3>
            ) : (
              <h2 className="font-bold text-white">{t('title')}</h2>
            )}
            <p className="text-gray-500 text-xs mt-1 leading-relaxed">
              {t('description')}
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2.5">
          <p className="text-[11px] text-gray-500 uppercase tracking-wide">
            {t('currentSelection')}
          </p>
          <div className="mt-1">
            {guildName && (
              <p className="text-sm text-white font-semibold truncate">{guildName}</p>
            )}
            <p className="text-xs text-gray-400 font-mono break-all">{guildId}</p>
            <p className="text-[11px] text-gray-500 mt-1 font-mono">
              {t(
                server === 'east'
                  ? 'serverEastLabel'
                  : server === 'west'
                  ? 'serverWestLabel'
                  : 'serverEuropeLabel',
              )}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
          <Lock size={14} className="text-amber-300 mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-amber-200">{t('lockedTitle')}</p>
            <p className="text-[11px] text-amber-100/80 leading-relaxed">
              {t('lockedBody')}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={containerClass}>
      <div className="flex items-start gap-2">
        {!embedded && <Shield size={16} className="text-amber-400 mt-0.5" />}
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {embedded ? (
              <h3 className="font-semibold text-white text-sm">{t('title')}</h3>
            ) : (
              <h2 className="font-bold text-white">{t('title')}</h2>
            )}
            {isSuperAdmin && initialGuildId && (
              <span className="inline-flex items-center gap-1 rounded-md bg-fuchsia-500/15 border border-fuchsia-400/40 px-1.5 py-0.5 text-[10px] font-semibold text-fuchsia-200 uppercase tracking-wide">
                <ShieldCheck size={10} />
                {t('superAdminBadge')}
              </span>
            )}
          </div>
          <p className="text-gray-500 text-xs mt-1 leading-relaxed">
            {t('description')}
          </p>
        </div>
      </div>

      {showFirstTimeWarning && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2.5">
          <AlertTriangle size={14} className="text-rose-300 mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-rose-200">
              {t('firstTimeWarningTitle')}
            </p>
            <p className="text-[11px] text-rose-100/80 leading-relaxed">
              {t('firstTimeWarningBody')}
            </p>
          </div>
        </div>
      )}

      {isSuperAdmin && initialGuildId && (
        <div className="flex items-start gap-2 rounded-lg border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-2.5">
          <ShieldCheck size={14} className="text-fuchsia-300 mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-fuchsia-100/90 leading-relaxed">
            {t('superAdminHint')}
          </p>
        </div>
      )}

      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
          <Globe2 size={12} /> {t('serverHeading')}
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
              <span className="text-sm text-white font-semibold">{t(opt.labelKey)}</span>
              <span className="block text-[11px] text-gray-500 mt-0.5 font-mono">{t(opt.hintKey)}</span>
            </span>
          </label>
        ))}
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
          <Shield size={12} /> {t('guildHeading')}
        </h3>

        <div className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2.5">
          <p className="text-[11px] text-gray-500 uppercase tracking-wide">{t('currentSelection')}</p>
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
                <Trash2 size={11} /> {t('clearGuild')}
              </button>
            </div>
          ) : (
            <p className="text-xs text-amber-300 mt-1">
              {t('unsetWarning')}
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
            placeholder={t('searchPlaceholder')}
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
          <p className="text-xs text-gray-500 text-center py-2">{t('searchEmpty')}</p>
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
          {isPending ? tc('saving') : tc('save')}
        </button>
        {saved && !dirty && (
          <span className="text-[11px] text-emerald-400">{tc('saved')}</span>
        )}
      </div>
    </div>
  )
}
