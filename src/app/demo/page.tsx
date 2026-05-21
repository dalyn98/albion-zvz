import { getTranslations } from 'next-intl/server'
import {
  ExternalLink,
  Users,
  Swords,
  ShieldCheck,
  ShieldHalf,
  Trophy,
  Activity,
  Globe,
  Clock,
  Languages,
  Crown,
  Skull,
  Calendar,
  ShieldAlert,
  BarChart3,
  Sparkles,
} from 'lucide-react'
import {
  DEMO_ADMIN_BADGES,
  DEMO_ALLIANCE_TAG,
  DEMO_GUILD_NAME,
  DEMO_GUILD_SLUG,
  DEMO_MEMBERS,
  DEMO_WEEKLY_STATS,
} from '@/data/demo-seed'
import DemoGuidedTour from './_components/DemoGuidedTour'
import DemoCTACard from './_components/DemoCTACard'

const DISCORD_INVITE_URL = '/api/auth/discord/start?returnTo=/'
const LIFETIME_BATTLES = 312
const LIFETIME_REGEAR = 1840

const RIVAL_GUILDS = [
  { name: 'Wraith', battles: 18 },
  { name: 'Frostbite', battles: 12 },
  { name: 'Steel Talon', battles: 9 },
  { name: 'Ironclad', battles: 6 },
] as const

const RECENT_BATTLE = {
  outcome: 'victory' as const,
  opponent: 'Wraith',
  zone: 'Mercia',
  killCount: 42,
  deathCount: 14,
  daysAgo: 1,
}

const HOME_TOUR_STEPS = [
  { id: 'hero' },
  { id: 'admin-pending' },
  { id: 'member-dashboard' },
  { id: 'weekly-kpi' },
  { id: 'recent-battle' },
  { id: 'weapon-distribution' },
] as const

export default async function DemoHomePage() {
  const [tHome, tDemo, tCta] = await Promise.all([
    getTranslations('demo.home'),
    getTranslations('demo'),
    getTranslations('demo.ctaCard'),
  ])

  const totalParticipation = DEMO_MEMBERS.reduce(
    (acc, m) => acc + m.weeklyAttendance.attended,
    0,
  )
  const topContributors = [...DEMO_MEMBERS]
    .sort((a, b) => b.weeklyAttendance.attended * 100 + b.kills - (a.weeklyAttendance.attended * 100 + a.kills))
    .slice(0, 5)

  const weaponTally = new Map<string, number>()
  for (const m of DEMO_MEMBERS) {
    weaponTally.set(m.primaryWeapon, (weaponTally.get(m.primaryWeapon) ?? 0) + 1)
  }
  const weaponTotal = Array.from(weaponTally.values()).reduce((s, n) => s + n, 0)
  const weaponDistribution = Array.from(weaponTally.entries())
    .map(([weapon, count]) => ({ weapon, count }))
    .sort((a, b) => b.count - a.count)

  const weeklyKd =
    DEMO_WEEKLY_STATS.deaths > 0
      ? (DEMO_WEEKLY_STATS.kills / DEMO_WEEKLY_STATS.deaths).toFixed(2)
      : '∞'

  const meDashboard = DEMO_MEMBERS.find((m) => m.ign === 'Eternia') ?? DEMO_MEMBERS[0]

  const adminPendingTotal =
    DEMO_ADMIN_BADGES.regear +
    DEMO_ADMIN_BADGES.exchange +
    DEMO_ADMIN_BADGES.donation +
    DEMO_ADMIN_BADGES.shop +
    DEMO_ADMIN_BADGES.eventPayout +
    DEMO_ADMIN_BADGES.craft

  return (
    <div className="-m-4 sm:-m-6 lg:-m-8 min-h-screen bg-[#08090d] text-white">
      <DemoGuidedTour steps={HOME_TOUR_STEPS} namespace="home" autoStart />
      <header data-tour-id="hero" className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-amber-500/15 via-amber-500/5 to-transparent" />
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none mix-blend-overlay"
          style={{
            backgroundImage:
              'radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)',
            backgroundSize: '3px 3px',
          }}
        />
        <div className="absolute top-0 left-0 bottom-0 w-[3px] bg-amber-500/60" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-amber-500/20" />

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-lg text-sm font-bold ring-2 backdrop-blur-sm bg-amber-500/15 text-amber-200 ring-amber-500/40">
                <ShieldCheck size={14} />
                <span className="text-[10px] uppercase tracking-[0.25em] opacity-80">
                  {tHome('heroAlliance')}
                </span>
                <span className="font-mono tracking-wider text-base">[{DEMO_ALLIANCE_TAG}]</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-200 border border-amber-400/40 uppercase tracking-wider">
                <Sparkles size={11} />
                {tHome('demoBadge')}
              </span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ring-1 backdrop-blur-sm bg-emerald-500/15 text-emerald-200 ring-emerald-500/40">
                <span className="relative flex w-2 h-2">
                  <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-400" />
                </span>
                {tHome('heroRecruitmentOpen')}
              </span>
              <span className="text-gray-500 text-[11px] font-mono tracking-[0.2em] uppercase">
                /g/{DEMO_GUILD_SLUG}
              </span>
            </div>
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tighter text-white drop-shadow-[0_4px_20px_rgba(0,0,0,0.6)] break-words">
              {DEMO_GUILD_NAME}
            </h1>
            <p className="text-gray-200 text-base sm:text-lg leading-relaxed max-w-2xl">
              {tHome('heroDescription')}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <HeroChip icon={<Globe size={12} />} label={tHome('heroChipServer')} />
              <HeroChip icon={<Clock size={12} />} label={tHome('heroChipActiveHours')} />
              <HeroChip icon={<Languages size={12} />} label={tHome('heroChipLanguages')} />
            </div>
            <div className="pt-3">
              <a
                href={DISCORD_INVITE_URL}
                className="group inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold px-6 py-3.5 rounded-lg transition-all text-sm shadow-lg hover:shadow-2xl hover:-translate-y-0.5"
              >
                {tHome('joinCta')}
                <ExternalLink
                  size={14}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </a>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-10">
        <p className="text-[11px] text-amber-300/70 italic">{tHome('demoNote')}</p>

        <div data-tour-id="admin-pending">
          <AdminPendingCard totalPending={adminPendingTotal} tHome={tHome} />
        </div>

        <div data-tour-id="member-dashboard">
          <MemberDashboardSection
            member={meDashboard}
            tHome={tHome}
          />
        </div>

        <section data-tour-id="weekly-kpi" className="space-y-3">
          <SectionHeader icon={<Activity size={14} />} label={tHome('weeklyHeading')} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label={tHome('weeklyEvents')} value={DEMO_WEEKLY_STATS.events} />
            <KpiCard label={tHome('weeklyKills')} value={DEMO_WEEKLY_STATS.kills} />
            <KpiCard label={tHome('weeklyDeaths')} value={DEMO_WEEKLY_STATS.deaths} />
            <KpiCard label={tHome('weeklyKd')} value={weeklyKd} />
          </div>
        </section>

        <section className="space-y-3">
          <SectionHeader icon={<BarChart3 size={14} />} label={tHome('statsHeading')} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard
              icon={<Users size={18} />}
              label={tHome('statMembers')}
              value={DEMO_MEMBERS.length}
              unit={tHome('statMembersUnit')}
            />
            <StatCard
              icon={<Swords size={18} />}
              label={tHome('statBattles')}
              value={LIFETIME_BATTLES}
              unit={tHome('statBattlesUnit')}
            />
            <StatCard
              icon={<ShieldHalf size={18} />}
              label={tHome('statRegear')}
              value={LIFETIME_REGEAR}
              unit={tHome('statRegearUnit')}
            />
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div data-tour-id="recent-battle" className="lg:col-span-3 space-y-3">
            <SectionHeader icon={<Calendar size={14} />} label={tHome('recentBattleHeading')} />
            <RecentBattleCard tHome={tHome} />
          </div>
          <div className="lg:col-span-2 space-y-3">
            <SectionHeader icon={<Trophy size={14} />} label={tHome('topContributorsHeading')} />
            <TopContributorsList
              members={topContributors}
              tHome={tHome}
              totalParticipation={totalParticipation}
            />
          </div>
        </section>

        <section data-tour-id="weapon-distribution" className="space-y-3">
          <SectionHeader icon={<Swords size={14} />} label={tHome('weaponsHeading')} />
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-2.5">
            {weaponDistribution.map(({ weapon, count }) => (
              <WeaponBar
                key={weapon}
                label={tDemo(`weapons.${weapon}`)}
                count={count}
                total={weaponTotal}
              />
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <SectionHeader icon={<ShieldAlert size={14} />} label={tHome('rivalsHeading')} />
          <ul className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800">
            {RIVAL_GUILDS.map((g) => (
              <li
                key={g.name}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <span className="font-semibold text-white">{g.name}</span>
                <span className="font-mono text-xs text-amber-300">
                  {g.battles} {tHome('statBattlesUnit')}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <DemoCTACard
          eyebrow={tCta('eyebrow')}
          title={tCta('home.title')}
          description={tCta('home.description')}
          buttonLabel={tCta('buttonLabel')}
        />
      </main>
    </div>
  )
}

function HeroChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium ring-1 backdrop-blur-sm bg-white/5 text-gray-200 ring-white/10">
      <span className="text-amber-300">{icon}</span>
      {label}
    </span>
  )
}

function SectionHeader({
  icon,
  label,
}: {
  icon: React.ReactNode
  label: string
}) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-bold text-amber-200 uppercase tracking-[0.2em]">
      <span className="text-amber-300">{icon}</span>
      {label}
    </div>
  )
}

function KpiCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-3">
      <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">{label}</p>
      <p className="text-xl font-black text-white font-mono mt-0.5">{value}</p>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  unit,
}: {
  icon: React.ReactNode
  label: string
  value: number
  unit: string
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-4 flex items-center gap-3">
      <span className="text-amber-300 flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">{label}</p>
        <p className="text-2xl font-black text-white font-mono mt-0.5">
          {value.toLocaleString()}
          <span className="text-xs text-gray-500 font-medium ml-1.5">{unit}</span>
        </p>
      </div>
    </div>
  )
}

function RecentBattleCard({
  tHome,
}: {
  tHome: Awaited<ReturnType<typeof getTranslations<'demo.home'>>>
}) {
  const outcomeLabel =
    RECENT_BATTLE.outcome === 'victory'
      ? tHome('recentBattleVictory')
      : RECENT_BATTLE.outcome === 'defeat'
        ? tHome('recentBattleDefeat')
        : tHome('recentBattleDraw')
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 uppercase tracking-wider">
          <Trophy size={10} />
          {outcomeLabel}
        </span>
        <span className="text-[11px] text-gray-500">
          {tHome('recentBattleVs', { opponent: RECENT_BATTLE.opponent })}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-center">
            <Crown size={16} className="text-amber-300 mx-auto mb-0.5" />
            <p className="text-2xl font-black font-mono text-white">{RECENT_BATTLE.killCount}</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">
              {tHome('weeklyKills')}
            </p>
          </div>
          <span className="text-gray-700 text-2xl font-mono">·</span>
          <div className="text-center">
            <Skull size={16} className="text-rose-300 mx-auto mb-0.5" />
            <p className="text-2xl font-black font-mono text-white">{RECENT_BATTLE.deathCount}</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">
              {tHome('weeklyDeaths')}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold text-gray-300">{RECENT_BATTLE.zone}</p>
          <p className="text-[10px] text-gray-500 mt-0.5">+{RECENT_BATTLE.daysAgo}d</p>
        </div>
      </div>
    </div>
  )
}

function TopContributorsList({
  members,
  tHome,
  totalParticipation,
}: {
  members: typeof DEMO_MEMBERS
  tHome: Awaited<ReturnType<typeof getTranslations<'demo.home'>>>
  totalParticipation: number
}) {
  return (
    <ul className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800">
      {members.slice(0, 5).map((m, idx) => {
        const pct =
          totalParticipation > 0
            ? Math.round((m.weeklyAttendance.attended / totalParticipation) * 100)
            : 0
        return (
          <li key={m.ign} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <span className="w-5 text-[10px] font-bold text-amber-300 text-right">
              #{idx + 1}
            </span>
            <span className="flex-1 truncate font-semibold text-white">{m.ign}</span>
            <span className="font-mono text-xs text-amber-300">
              {m.weeklyAttendance.attended} ({pct}%)
            </span>
          </li>
        )
      })}
      <li className="px-4 py-2 text-[10px] text-gray-600 italic">{tHome('topContributorsHint')}</li>
    </ul>
  )
}

function WeaponBar({
  label,
  count,
  total,
}: {
  label: string
  count: number
  total: number
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-medium text-gray-300 w-20 truncate">{label}</span>
      <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-amber-500 to-amber-400"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] font-mono text-gray-400 w-12 text-right">
        {count} ({pct}%)
      </span>
    </div>
  )
}

function MemberDashboardSection({
  member,
  tHome,
}: {
  member: (typeof DEMO_MEMBERS)[number]
  tHome: Awaited<ReturnType<typeof getTranslations<'demo.home'>>>
}) {
  const kd = member.deaths > 0 ? (member.kills / member.deaths).toFixed(2) : '∞'
  return (
    <section className="space-y-3">
      <SectionHeader icon={<Users size={14} />} label={tHome('memberDashboardHeading')} />
      <p className="text-[11px] text-gray-500">{tHome('memberDashboardHint')}</p>
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500/30 to-amber-500/10 border border-amber-500/30 flex items-center justify-center text-sm font-bold text-amber-200">
            {member.ign.charAt(0)}
          </div>
          <div>
            <p className="text-sm font-semibold text-white flex items-center gap-1.5">
              <Crown size={12} className="text-amber-300" />
              {member.ign}
            </p>
            <p className="text-[11px] text-gray-500">+{member.joinedDaysAgo}d</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <MiniStat label={tHome('memberPoints')} value={member.points.toLocaleString()} />
          <MiniStat label={tHome('memberKd')} value={kd} />
          <MiniStat
            label={tHome('memberAttend')}
            value={`${member.weeklyAttendance.attended}/${member.weeklyAttendance.total}`}
          />
          <MiniStat
            label={tHome('memberRecentRegears', { n: member.recentRegears })}
            value={`${member.recentRegears}`}
          />
        </div>
      </div>
    </section>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-950 border border-gray-800 rounded-md p-2">
      <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold truncate">
        {label}
      </p>
      <p className="text-sm font-bold text-white font-mono mt-0.5">{value}</p>
    </div>
  )
}

function AdminPendingCard({
  totalPending,
  tHome,
}: {
  totalPending: number
  tHome: Awaited<ReturnType<typeof getTranslations<'demo.home'>>>
}) {
  if (totalPending === 0) return null
  const items = [
    { key: 'regear', label: tHome('adminPendingRegear'), count: DEMO_ADMIN_BADGES.regear },
    { key: 'exchange', label: tHome('adminPendingExchange'), count: DEMO_ADMIN_BADGES.exchange },
    { key: 'donation', label: tHome('adminPendingDonation'), count: DEMO_ADMIN_BADGES.donation },
    { key: 'shop', label: tHome('adminPendingShop'), count: DEMO_ADMIN_BADGES.shop },
    { key: 'eventPayout', label: tHome('adminPendingPayout'), count: DEMO_ADMIN_BADGES.eventPayout },
    { key: 'craft', label: tHome('adminPendingCraft'), count: DEMO_ADMIN_BADGES.craft },
  ].filter((i) => i.count > 0)
  return (
    <section className="space-y-3">
      <SectionHeader icon={<ShieldAlert size={14} />} label={tHome('adminPendingHeading')} />
      <p className="text-[11px] text-gray-500">{tHome('adminPendingHint')}</p>
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex items-center flex-wrap gap-3">
        {items.map((it) => (
          <span
            key={it.key}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/15 text-rose-200 border border-rose-500/30"
          >
            {it.label}
            <span className="text-[10px] bg-rose-500 text-white px-1.5 rounded-full font-mono">
              {it.count}
            </span>
          </span>
        ))}
      </div>
    </section>
  )
}
