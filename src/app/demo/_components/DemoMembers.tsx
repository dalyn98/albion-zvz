'use client'

import { useMemo, useState } from 'react'
import { Search, Users, Award, Calendar } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { DEMO_MEMBERS, type DemoMember } from '@/data/demo-seed'

const ROLE_TONE: Record<DemoMember['role'], string> = {
  관리자: 'bg-amber-500/20 text-amber-300',
  콜러: 'bg-rose-500/20 text-rose-300',
  정회원: 'bg-green-500/20 text-green-300',
  인턴: 'bg-blue-500/20 text-blue-300',
}

export function DemoMembers() {
  const t = useTranslations('demo.members')
  const [query, setQuery] = useState('')
  const [activeIgn, setActiveIgn] = useState(DEMO_MEMBERS[0]!.ign)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return DEMO_MEMBERS
    return DEMO_MEMBERS.filter(
      (m) => m.ign.toLowerCase().includes(q) || m.role.includes(q),
    )
  }, [query])

  const active = DEMO_MEMBERS.find((m) => m.ign === activeIgn) ?? DEMO_MEMBERS[0]!

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      <div className="lg:col-span-2 space-y-3">
        <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 inline-flex items-center gap-3">
          <Users size={18} className="text-amber-400" />
          <span className="text-sm font-semibold text-white">
            {t('memberCount', { count: filtered.length })}
          </span>
        </div>

        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
          />
        </div>

        <div className="space-y-1.5 max-h-[460px] overflow-y-auto pr-1">
          {filtered.map((m) => {
            const isActive = m.ign === activeIgn
            return (
              <button
                key={m.ign}
                onClick={() => setActiveIgn(m.ign)}
                className={`w-full flex items-center gap-3 bg-gray-900 border rounded-lg px-4 py-3 transition-colors ${
                  isActive
                    ? 'border-amber-500/40'
                    : 'border-gray-800 hover:border-amber-500/40'
                }`}
              >
                <div className="w-9 h-9 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center shrink-0 text-sm font-bold text-gray-300">
                  {m.ign[0]}
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <div className="text-white text-sm font-semibold truncate">{m.ign}</div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${ROLE_TONE[m.role]}`}>
                      {m.role}
                    </span>
                    <span className="text-[10px] text-gray-500">
                      {m.weeklyAttendance}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-amber-400 font-mono font-semibold text-sm">
                    {m.points.toLocaleString('en-US')}
                  </div>
                  <div className="text-gray-500 text-[10px]">{t('points')}</div>
                </div>
              </button>
            )
          })}
          {filtered.length === 0 && (
            <div className="text-gray-500 text-sm text-center py-6">{t('emptySearch')}</div>
          )}
        </div>
      </div>

      <div className="lg:col-span-3 space-y-3">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center shrink-0 text-lg font-bold text-amber-400">
              {active.ign[0]}
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-white truncate">{active.ign}</h3>
              <div className="flex items-center gap-1.5 mt-1">
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${ROLE_TONE[active.role]}`}>
                  {active.role}
                </span>
                <span className="text-xs text-gray-500">
                  {t('joinedAgo', { days: active.joinedDaysAgo })}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <DetailMetric label={t('points')} value={`${active.points.toLocaleString('en-US')}`} />
          <DetailMetric label={t('attendance')} value={active.weeklyAttendance} />
          <DetailMetric label={t('regears')} value={String(active.recentRegears)} />
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 space-y-1">
          <div className="flex items-center gap-1.5 text-gray-500 text-[11px] font-semibold uppercase tracking-wider">
            <Calendar size={11} />
            {t('lastEvent')}
          </div>
          <div className="text-sm text-white">{active.lastEventLabel}</div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 space-y-2">
          <div className="flex items-center gap-1.5 text-gray-500 text-[11px] font-semibold uppercase tracking-wider">
            <Award size={11} />
            {t('achievements')}
          </div>
          {active.achievements.length === 0 ? (
            <div className="text-gray-500 text-sm italic">{t('noAchievements')}</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {active.achievements.map((a) => (
                <span
                  key={a}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold bg-amber-500/10 border border-amber-500/30 rounded-full px-2.5 py-1 text-amber-300"
                >
                  <Award size={10} />
                  {a}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2.5">
      <div className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className="text-amber-400 font-mono font-semibold text-sm">{value}</div>
    </div>
  )
}
