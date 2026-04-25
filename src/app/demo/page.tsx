import { getTranslations } from 'next-intl/server'
import {
  Award,
  CheckCircle2,
  ChevronRight,
  Coins,
  ExternalLink,
  Hammer,
  Shield,
  Sparkles,
  Sword,
  Swords,
  Target,
  Trophy,
  UserCircle2,
  Users,
} from 'lucide-react'

export const dynamic = 'force-static'

// 공개 데모 페이지. 누구나 로그인 없이 볼 수 있으며 (layout.tsx 의
// isPublicPathname 에 등록), 실제 길드 데이터는 보여주지 않고 모든 핵심 기능의
// UI 만 한 페이지에 담아 마케팅/사이트 소개 용도로 쓴다.
//
// 구조: hero → 7 개 feature 섹션 (멤버 메인 / 이벤트 / 리기어 / 환전 /
// 통계 / 전투 / 관리자) → 풋터 CTA. ko/en/ja 모두 i18n 키로 처리.

export default async function DemoPage() {
  const t = await getTranslations('demo')

  const navItems = [
    { id: 'member-home', label: t('nav.memberHome') },
    { id: 'events', label: t('nav.events') },
    { id: 'regear', label: t('nav.regear') },
    { id: 'exchange', label: t('nav.exchange') },
    { id: 'stats', label: t('nav.stats') },
    { id: 'battles', label: t('nav.battles') },
    { id: 'admin', label: t('nav.admin') },
  ]

  return (
    <div className="min-h-screen bg-[#0f1117] text-white">
      <DemoBanner text={t('banner')} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-24">
        <Hero t={t} />
        <SectionNav items={navItems} />

        <Section id="member-home" title={t('memberHome.title')} subtitle={t('memberHome.subtitle')}>
          <MemberHomeMock t={t} />
        </Section>

        <Section id="events" title={t('events.title')} subtitle={t('events.subtitle')}>
          <EventsMock t={t} />
        </Section>

        <Section id="regear" title={t('regear.title')} subtitle={t('regear.subtitle')}>
          <RegearMock t={t} />
        </Section>

        <Section id="exchange" title={t('exchange.title')} subtitle={t('exchange.subtitle')}>
          <ExchangeMock t={t} />
        </Section>

        <Section id="stats" title={t('stats.title')} subtitle={t('stats.subtitle')}>
          <StatsMock t={t} />
        </Section>

        <Section id="battles" title={t('battles.title')} subtitle={t('battles.subtitle')}>
          <BattlesMock t={t} />
        </Section>

        <Section id="admin" title={t('admin.title')} subtitle={t('admin.subtitle')}>
          <AdminMock t={t} />
        </Section>

        <Footer t={t} />
      </main>
    </div>
  )
}

type Translator = Awaited<ReturnType<typeof getTranslations<'demo'>>>

function DemoBanner({ text }: { text: string }) {
  return (
    <div className="sticky top-0 z-40 bg-amber-500/95 text-black text-center text-xs sm:text-sm font-semibold py-2 px-4 backdrop-blur">
      <span className="inline-flex items-center gap-1.5">
        <Sparkles size={14} />
        {text}
      </span>
    </div>
  )
}

function Hero({ t }: { t: Translator }) {
  return (
    <section className="pt-12 sm:pt-20 pb-10">
      <div className="text-center max-w-3xl mx-auto">
        <p className="text-xs sm:text-sm text-amber-400 uppercase tracking-[0.2em] font-semibold mb-4">
          {t('hero.eyebrow')}
        </p>
        <h1 className="text-3xl sm:text-5xl font-bold leading-tight mb-5 bg-gradient-to-br from-white to-white/60 bg-clip-text text-transparent">
          {t('hero.title')}
        </h1>
        <p className="text-sm sm:text-base text-white/70 leading-relaxed mb-8">
          {t('hero.subtitle')}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <a
            href="/api/auth/discord/start?returnTo=/"
            className="inline-flex items-center gap-2 bg-[#5865F2] hover:bg-[#4752c4] transition-colors px-5 py-2.5 rounded-lg text-sm font-semibold"
          >
            <Sparkles size={16} />
            {t('hero.ctaPrimary')}
          </a>
          <a
            href="#member-home"
            className="inline-flex items-center gap-1.5 text-white/70 hover:text-white text-sm font-medium px-3 py-2"
          >
            <ChevronRight size={16} />
            {t('nav.memberHome')}
          </a>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:gap-6 max-w-2xl mx-auto mt-12 sm:mt-16">
        <HeroStat label={t('hero.stat1Label')} value={t('hero.stat1Value')} />
        <HeroStat label={t('hero.stat2Label')} value={t('hero.stat2Value')} />
        <HeroStat label={t('hero.stat3Label')} value={t('hero.stat3Value')} />
      </div>
    </section>
  )
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 px-3 sm:px-5 py-3 sm:py-4 text-center">
      <div className="text-xl sm:text-3xl font-bold text-amber-400">{value}</div>
      <div className="text-[10px] sm:text-xs text-white/50 mt-1">{label}</div>
    </div>
  )
}

function SectionNav({ items }: { items: Array<{ id: string; label: string }> }) {
  return (
    <nav className="my-8 flex flex-wrap gap-2 justify-center">
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className="text-xs sm:text-sm bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-full px-3 py-1.5 text-white/80 hover:text-white transition-colors"
        >
          {item.label}
        </a>
      ))}
    </nav>
  )
}

function Section({
  id,
  title,
  subtitle,
  children,
}: {
  id: string
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-20 py-12 border-t border-white/5">
      <div className="mb-6">
        <h2 className="text-xl sm:text-2xl font-bold mb-2">{title}</h2>
        <p className="text-sm text-white/60 leading-relaxed">{subtitle}</p>
      </div>
      <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-4 sm:p-6">
        {children}
      </div>
    </section>
  )
}

function MemberHomeMock({ t }: { t: Translator }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 rounded-xl bg-gradient-to-br from-amber-500/15 to-amber-500/5 border border-amber-500/20 p-5">
        <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold mb-2">
          <Coins size={14} />
          {t('memberHome.pointsLabel')}
        </div>
        <div className="text-4xl sm:text-5xl font-bold mb-1">2,340<span className="text-base text-amber-400/80 ml-1">p</span></div>
        <div className="text-xs text-white/50">{t('memberHome.pointsHint')}</div>

        <div className="grid grid-cols-2 gap-3 mt-6">
          <MiniStat label={t('memberHome.monthLabel')} value="14" suffix="/ 22" />
          <MiniStat label={t('memberHome.weekLabel')} value="4" suffix="/ 6" />
        </div>

        <div className="mt-5 pt-4 border-t border-white/10 text-xs">
          <span className="text-white/50">{t('memberHome.lastEventLabel')}: </span>
          <span className="text-white/90">{t('memberHome.lastEventValue')}</span>
        </div>
      </div>

      <div className="rounded-xl bg-white/5 border border-white/10 p-5">
        <div className="flex items-center gap-2 text-white/80 text-xs font-semibold mb-3">
          <Trophy size={14} />
          {t('memberHome.badgeTitle')}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <BadgePill label={t('memberHome.badge1')} />
          <BadgePill label={t('memberHome.badge2')} highlight />
          <BadgePill label={t('memberHome.badge3')} />
          <BadgePill label={t('memberHome.badge4')} />
        </div>
        <button className="mt-4 w-full text-xs text-white/60 hover:text-white border border-white/10 hover:border-white/30 rounded-lg py-2">
          {t('memberHome.viewMine')} →
        </button>
      </div>
    </div>
  )
}

function MiniStat({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-white/50 mb-1">{label}</div>
      <div className="text-2xl font-bold">
        {value}
        {suffix && <span className="text-sm text-white/40 ml-1">{suffix}</span>}
      </div>
    </div>
  )
}

function BadgePill({ label, highlight }: { label: string; highlight?: boolean }) {
  return (
    <div
      className={`flex items-center gap-1.5 text-xs rounded-md px-2 py-1.5 border ${
        highlight
          ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
          : 'bg-white/5 border-white/10 text-white/80'
      }`}
    >
      <Award size={12} />
      <span className="truncate">{label}</span>
    </div>
  )
}

function EventsMock({ t }: { t: Translator }) {
  return (
    <div className="rounded-xl bg-[#0b0d12] border border-white/10 p-5">
      <div className="flex items-start justify-between mb-5 gap-3 flex-wrap">
        <div>
          <div className="text-base sm:text-lg font-bold mb-1">{t('events.eventName')}</div>
          <div className="text-xs text-emerald-400 font-medium">{t('events.scheduledFor')}</div>
        </div>
        <span className="text-xs bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-full px-3 py-1">
          LIVE
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <SlotCardMock
          icon={<Target size={14} />}
          role={t('events.callerLabel')}
          name={t('events.callerName')}
          filled
          accent="amber"
        />
        <SlotCardMock
          icon={<Shield size={14} />}
          role={t('events.tankLabel')}
          name={t('events.tankFilled')}
          filled
        />
        <SlotCardMock
          icon={<Sparkles size={14} />}
          role={t('events.healLabel')}
          name={t('events.healFilled')}
          filled
        />
        <SlotCardMock
          icon={<Sparkles size={14} />}
          role={t('events.supportLabel')}
          name={t('events.supportFilled')}
          filled
        />
        <SlotCardMock
          icon={<Sword size={14} />}
          role={t('events.dpsLabel')}
          name={t('events.dpsFilled')}
          filled
        />
        <SlotCardMock
          icon={<Sword size={14} />}
          role={t('events.dpsLabel')}
          name=""
          filled={false}
          openLabel={t('events.openSlot')}
        />
      </div>
    </div>
  )
}

function SlotCardMock({
  icon,
  role,
  name,
  filled,
  openLabel,
  accent,
}: {
  icon: React.ReactNode
  role: string
  name: string
  filled: boolean
  openLabel?: string
  accent?: 'amber'
}) {
  if (!filled) {
    return (
      <div className="rounded-lg border border-dashed border-white/15 p-3 text-center hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-colors cursor-pointer">
        <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">{role}</div>
        <div className="text-xs font-medium text-emerald-400">{openLabel}</div>
      </div>
    )
  }
  return (
    <div
      className={`rounded-lg border p-3 ${
        accent === 'amber'
          ? 'bg-amber-500/10 border-amber-500/30'
          : 'bg-white/5 border-white/10'
      }`}
    >
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/50 mb-1">
        {icon}
        <span className="truncate">{role}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <UserCircle2 size={14} className="text-white/40 shrink-0" />
        <span className="text-sm font-medium truncate">{name}</span>
      </div>
    </div>
  )
}

function RegearMock({ t }: { t: Translator }) {
  const rows = [
    { item: t('regear.row1Item'), qty: 1, price: '128k' },
    { item: t('regear.row2Item'), qty: 1, price: '94k' },
    { item: t('regear.row3Item'), qty: 1, price: '76k' },
    { item: t('regear.row4Item'), qty: 1, price: '210k' },
  ]
  return (
    <div className="rounded-xl bg-[#0b0d12] border border-white/10 p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <div className="text-xs text-white/50 mb-0.5">{t('regear.demoBattle')}</div>
          <div className="text-sm font-semibold">
            <span className="text-white/60">{t('regear.claimerLabel')}: </span>
            {t('regear.claimerName')}
          </div>
        </div>
        <span className="text-xs bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded-full px-3 py-1 self-start">
          {t('regear.statusPending')}
        </span>
      </div>

      <div className="text-xs text-white/60 italic mb-4">{t('regear.claimerNote')}</div>

      <div className="rounded-lg border border-white/10 overflow-hidden">
        <div className="grid grid-cols-[1fr,60px,90px] text-[10px] uppercase tracking-wider text-white/40 bg-white/[0.03] px-3 py-2 border-b border-white/10">
          <div>{t('regear.rowItem')}</div>
          <div className="text-right">{t('regear.rowQty')}</div>
          <div className="text-right">{t('regear.rowPrice')}</div>
        </div>
        {rows.map((row) => (
          <div
            key={row.item}
            className="grid grid-cols-[1fr,60px,90px] text-sm px-3 py-2 border-b border-white/5 last:border-b-0 items-center"
          >
            <div className="truncate flex items-center gap-2">
              <Hammer size={12} className="text-white/30 shrink-0" />
              {row.item}
            </div>
            <div className="text-right text-white/70">{row.qty}</div>
            <div className="text-right font-medium">{row.price}</div>
          </div>
        ))}
        <div className="grid grid-cols-[1fr,60px,90px] text-sm px-3 py-2 bg-white/[0.03] border-t border-white/10">
          <div className="font-semibold">{t('regear.totalLabel')}</div>
          <div></div>
          <div className="text-right font-bold text-amber-400">508k</div>
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        <button className="flex-1 inline-flex items-center justify-center gap-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-sm font-semibold rounded-lg py-2">
          <CheckCircle2 size={14} />
          {t('regear.approveButton')}
        </button>
        <button className="flex-1 inline-flex items-center justify-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 text-sm font-medium rounded-lg py-2">
          {t('regear.editButton')}
        </button>
      </div>
    </div>
  )
}

function ExchangeMock({ t }: { t: Translator }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="rounded-xl bg-[#0b0d12] border border-white/10 p-5">
        <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">{t('exchange.rateLabel')}</div>
        <div className="text-base font-semibold mb-4">{t('exchange.rateValue')}</div>

        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-4 mb-4">
          <div className="text-[10px] uppercase tracking-wider text-amber-400/80 mb-1">{t('exchange.myBalance')}</div>
          <div className="text-3xl font-bold">
            2,340<span className="text-base text-amber-400/80 ml-1">p</span>
          </div>
          <div className="text-xs text-emerald-400 mt-1">{t('exchange.myBalanceHint')}</div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button className="bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-medium rounded-lg py-2.5">
            {t('exchange.sellLabel')}
          </button>
          <button className="bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-medium rounded-lg py-2.5">
            {t('exchange.buyLabel')}
          </button>
        </div>
      </div>

      <div className="rounded-xl bg-[#0b0d12] border border-white/10 p-5">
        <div className="flex items-center gap-2 text-sm font-semibold mb-4">
          <Coins size={14} className="text-amber-400" />
          {t('exchange.shopTitle')}
        </div>
        <div className="space-y-2">
          {[t('exchange.shop1'), t('exchange.shop2'), t('exchange.shop3')].map((label, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between rounded-lg bg-white/[0.03] border border-white/10 px-3 py-2.5 text-sm hover:bg-white/[0.06] hover:border-white/20 cursor-pointer transition-colors"
            >
              <span className="truncate">{label}</span>
              <ChevronRight size={14} className="text-white/30 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function StatsMock({ t }: { t: Translator }) {
  const weapons = [
    { name: t('stats.weapon1'), pct: t('stats.weapon1Pct'), value: 62 },
    { name: t('stats.weapon2'), pct: t('stats.weapon2Pct'), value: 21 },
    { name: t('stats.weapon3'), pct: t('stats.weapon3Pct'), value: 17 },
  ]
  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      <div className="lg:col-span-2 rounded-xl bg-[#0b0d12] border border-white/10 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
            <UserCircle2 size={26} />
          </div>
          <div>
            <div className="text-base font-bold">{t('stats.memberName')}</div>
            <div className="text-xs text-white/50">{t('stats.memberRole')}</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <SmallMetric label={t('stats.kdLabel')} value="2.18" />
          <SmallMetric label={t('stats.survivalLabel')} value="73%" />
          <SmallMetric label={t('stats.totalBattles')} value="142" />
        </div>
      </div>

      <div className="lg:col-span-2 rounded-xl bg-[#0b0d12] border border-white/10 p-5">
        <div className="flex items-center gap-2 text-sm font-semibold mb-4">
          <Sword size={14} />
          {t('stats.weaponTitle')}
        </div>
        <div className="space-y-3">
          {weapons.map((w) => (
            <div key={w.name}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-white/80">{w.name}</span>
                <span className="text-white/50">{w.pct}</span>
              </div>
              <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 to-amber-500"
                  style={{ width: `${w.value}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl bg-[#0b0d12] border border-white/10 p-5">
        <div className="flex items-center gap-2 text-sm font-semibold mb-3">
          <Trophy size={14} className="text-amber-400" />
          {t('stats.trophyTitle')}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {[t('stats.trophy1'), t('stats.trophy2'), t('stats.trophy3'), t('stats.trophy4')].map(
            (label, idx) => (
              <div
                key={idx}
                className="flex flex-col items-center gap-1 rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-2.5 text-center"
              >
                <Trophy size={14} className="text-amber-400" />
                <span className="text-[10px] text-amber-200/90 leading-tight">{label}</span>
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  )
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/5 border border-white/10 p-2.5 text-center">
      <div className="text-lg font-bold">{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-white/40 mt-0.5">{label}</div>
    </div>
  )
}

function BattlesMock({ t }: { t: Translator }) {
  return (
    <div className="rounded-xl bg-[#0b0d12] border border-white/10 p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Swords size={16} className="text-amber-400" />
            <span className="text-base font-bold">{t('battles.battleTitle')}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-full px-2.5 py-0.5">
              {t('battles.outcomeWin')}
            </span>
            <span className="text-xs text-white/50">
              {t('battles.scaleLabel')}: {t('battles.scaleLarge')}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <TeamCard
          label={t('battles.homeLabel')}
          kills={t('battles.homeKills')}
          deaths={t('battles.homeDeaths')}
          tone="emerald"
        />
        <TeamCard
          label={t('battles.oppLabel')}
          kills={t('battles.oppKills')}
          deaths={t('battles.oppDeaths')}
          tone="rose"
        />
      </div>

      <details className="rounded-lg bg-white/[0.03] border border-white/10 overflow-hidden">
        <summary className="cursor-pointer text-xs px-3 py-2.5 hover:bg-white/[0.05] flex items-center gap-1.5 text-white/70">
          <ChevronRight size={12} />
          {t('battles.expandButton')}
        </summary>
        <div className="px-3 py-2 space-y-1 border-t border-white/10 font-mono text-[11px] text-white/70">
          <div>{t('battles.kill1')}</div>
          <div>{t('battles.kill2')}</div>
          <div>{t('battles.kill3')}</div>
        </div>
      </details>
    </div>
  )
}

function TeamCard({
  label,
  kills,
  deaths,
  tone,
}: {
  label: string
  kills: string
  deaths: string
  tone: 'emerald' | 'rose'
}) {
  const toneClass =
    tone === 'emerald'
      ? 'bg-emerald-500/10 border-emerald-500/25'
      : 'bg-rose-500/10 border-rose-500/25'
  const accent = tone === 'emerald' ? 'text-emerald-300' : 'text-rose-300'
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <div className={`text-[10px] uppercase tracking-wider font-semibold mb-2 ${accent}`}>
        {label}
      </div>
      <div className="text-sm space-y-0.5">
        <div>{kills}</div>
        <div className="text-white/60">{deaths}</div>
      </div>
    </div>
  )
}

function AdminMock({ t }: { t: Translator }) {
  const cards = [
    { icon: <Users size={16} />, title: t('admin.card1Title'), body: t('admin.card1Body') },
    { icon: <Shield size={16} />, title: t('admin.card2Title'), body: t('admin.card2Body') },
    { icon: <Coins size={16} />, title: t('admin.card3Title'), body: t('admin.card3Body') },
    { icon: <CheckCircle2 size={16} />, title: t('admin.card4Title'), body: t('admin.card4Body') },
  ]
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {cards.map((card, idx) => (
        <div
          key={idx}
          className="rounded-xl bg-[#0b0d12] border border-white/10 p-4 hover:border-white/20 transition-colors"
        >
          <div className="flex items-center gap-2 text-amber-400 mb-2">
            {card.icon}
            <span className="text-sm font-semibold">{card.title}</span>
          </div>
          <p className="text-xs text-white/60 leading-relaxed">{card.body}</p>
        </div>
      ))}
    </div>
  )
}

function Footer({ t }: { t: Translator }) {
  return (
    <section className="mt-16 rounded-2xl bg-gradient-to-br from-amber-500/15 via-transparent to-amber-500/5 border border-amber-500/20 p-8 sm:p-12 text-center">
      <h3 className="text-xl sm:text-2xl font-bold mb-2">{t('footer.title')}</h3>
      <p className="text-sm text-white/60 mb-6 max-w-md mx-auto">{t('footer.subtitle')}</p>
      <a
        href="/api/auth/discord/start?returnTo=/"
        className="inline-flex items-center gap-2 bg-[#5865F2] hover:bg-[#4752c4] transition-colors px-6 py-3 rounded-lg text-sm font-semibold"
      >
        <ExternalLink size={16} />
        {t('footer.cta')}
      </a>
      <p className="text-[10px] text-white/40 mt-6">{t('footer.note')}</p>
    </section>
  )
}
