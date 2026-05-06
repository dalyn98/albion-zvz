'use client'

import { useMemo, useState } from 'react'
import { Search, UserCircle2, Award, Coins, Calendar, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { DEMO_MEMBERS, type DemoMember } from '@/data/demo-seed'

const ROLE_TONE: Record<DemoMember['role'], string> = {
  관리자: 'bg-amber-500/15 border-amber-500/30 text-amber-200',
  콜러: 'bg-fuchsia-500/15 border-fuchsia-500/30 text-fuchsia-200',
  정회원: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200',
  인턴: 'bg-sky-500/15 border-sky-500/30 text-sky-200',
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
      <div className="lg:col-span-2 rounded-xl bg-[#0b0d12] border border-white/10 p-4">
        <div className="relative mb-3">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs text-white/90 placeholder-white/30 focus:border-amber-400/50 outline-none"
          />
        </div>
        <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
          {filtered.map((m) => {
            const isActive = m.ign === activeIgn
            return (
              <button
                key={m.ign}
                onClick={() => setActiveIgn(m.ign)}
                className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                  isActive
                    ? 'bg-amber-500/15 border-amber-500/40'
                    : 'bg-white/[0.03] border-white/10 hover:border-white/20'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <UserCircle2 size={20} className="text-white/40 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{m.ign}</div>
                    <div className="text-[10px] text-white/50 mt-0.5">
                      {m.role} · {t('points')}: {m.points.toLocaleString('en-US')}p
                    </div>
                  </div>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded border ${ROLE_TONE[m.role]}`}
                  >
                    {m.role}
                  </span>
                </div>
              </button>
            )
          })}
          {filtered.length === 0 && (
            <div className="text-xs text-white/40 text-center py-6">{t('emptySearch')}</div>
          )}
        </div>
      </div>

      <div className="lg:col-span-3 rounded-xl bg-[#0b0d12] border border-white/10 p-5">
        <div className="flex items-start gap-4 mb-5">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shrink-0">
            <UserCircle2 size={28} />
          </div>
          <div className="min-w-0">
            <div className="text-lg font-bold truncate">{active.ign}</div>
            <div className="text-xs text-white/50">
              {active.role} · {t('joinedAgo', { days: active.joinedDaysAgo })}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
          <DetailMetric
            icon={<Coins size={12} />}
            label={t('points')}
            value={`${active.points.toLocaleString('en-US')}p`}
          />
          <DetailMetric
            icon={<Calendar size={12} />}
            label={t('attendance')}
            value={active.weeklyAttendance}
          />
          <DetailMetric
            icon={<Sparkles size={12} />}
            label={t('regears')}
            value={String(active.recentRegears)}
          />
        </div>

        <div className="rounded-lg bg-white/[0.03] border border-white/10 p-3 mb-4">
          <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">
            {t('lastEvent')}
          </div>
          <div className="text-sm">{active.lastEventLabel}</div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wider text-white/40 mb-2 flex items-center gap-1.5">
            <Award size={11} />
            {t('achievements')}
          </div>
          {active.achievements.length === 0 ? (
            <div className="text-xs text-white/40 italic">{t('noAchievements')}</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {active.achievements.map((a) => (
                <span
                  key={a}
                  className="inline-flex items-center gap-1 text-[11px] bg-amber-500/10 border border-amber-500/30 rounded-full px-2.5 py-1 text-amber-200"
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

function DetailMetric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/50 mb-1">
        {icon}
        {label}
      </div>
      <div className="text-sm font-bold">{value}</div>
    </div>
  )
}
