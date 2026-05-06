import { getTranslations } from 'next-intl/server'
import { ChevronRight, ExternalLink, Sparkles } from 'lucide-react'
import { DemoEventEditor } from './_components/DemoEventEditor'
import { DemoAutoRegear } from './_components/DemoAutoRegear'
import { DemoCraftRegear } from './_components/DemoCraftRegear'
import { DemoStats } from './_components/DemoStats'
import { DemoMembers } from './_components/DemoMembers'

// 공개 데모 페이지. 누구나 로그인 없이 볼 수 있으며 (layout.tsx 의
// isPublicPathname 에 등록), 5 개 핵심 기능을 인터랙티브하게 체험.
//
// 데이터: 멘헤라스러운 inline mock (`src/data/demo-seed.ts`). 모든 인터랙션은
// 클라이언트 React state 로만 발생하며 서버 mutation 0. 새로고침하면 시드로 리셋.
//
// 주의: `force-static` 을 쓰지 않는다. layout 이 x-pathname 헤더로 isPublic
// 분기를 결정하는데, static prerender 는 빌드 타임에 헤더 없이 렌더돼 AppGate
// 가 HTML 에 박혀버린다. 동적 렌더로 둬야 layout 이 매 요청마다 pathname 을
// 보고 PublicShell/AppShell 도 건너뛰는 분기를 탄다.
export const dynamic = 'force-dynamic'

export default async function DemoPage() {
  const t = await getTranslations('demo')

  const navItems = [
    { id: 'events', label: t('nav.events') },
    { id: 'auto-regear', label: t('nav.autoRegear') },
    { id: 'craft-regear', label: t('nav.craftRegear') },
    { id: 'stats', label: t('nav.stats') },
    { id: 'members', label: t('nav.members') },
  ]

  return (
    <div className="min-h-screen bg-[#0f1117] text-white">
      <div className="sticky top-0 z-40 bg-amber-500/95 text-black text-center text-xs sm:text-sm font-semibold py-2 px-4 backdrop-blur">
        <span className="inline-flex items-center gap-1.5">
          <Sparkles size={14} />
          {t('banner')}
        </span>
      </div>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-24">
        <Hero
          eyebrow={t('hero.eyebrow')}
          title={t('hero.title')}
          subtitle={t('hero.subtitle')}
          ctaPrimary={t('hero.ctaPrimary')}
          jumpLabel={t('nav.events')}
          stats={[
            { label: t('hero.stat1Label'), value: t('hero.stat1Value') },
            { label: t('hero.stat2Label'), value: t('hero.stat2Value') },
            { label: t('hero.stat3Label'), value: t('hero.stat3Value') },
          ]}
        />

        <SectionNav items={navItems} />

        <Section id="events" title={t('events.title')} subtitle={t('events.subtitle')}>
          <DemoEventEditor />
        </Section>

        <Section id="auto-regear" title={t('autoRegear.title')} subtitle={t('autoRegear.subtitle')}>
          <DemoAutoRegear />
        </Section>

        <Section
          id="craft-regear"
          title={t('craftRegear.title')}
          subtitle={t('craftRegear.subtitle')}
        >
          <DemoCraftRegear />
        </Section>

        <Section id="stats" title={t('stats.title')} subtitle={t('stats.subtitle')}>
          <DemoStats />
        </Section>

        <Section id="members" title={t('members.title')} subtitle={t('members.subtitle')}>
          <DemoMembers />
        </Section>

        <Footer
          title={t('footer.title')}
          subtitle={t('footer.subtitle')}
          cta={t('footer.cta')}
          note={t('footer.note')}
        />
      </main>
    </div>
  )
}

function Hero({
  eyebrow,
  title,
  subtitle,
  ctaPrimary,
  jumpLabel,
  stats,
}: {
  eyebrow: string
  title: string
  subtitle: string
  ctaPrimary: string
  jumpLabel: string
  stats: Array<{ label: string; value: string }>
}) {
  return (
    <section className="pt-12 sm:pt-20 pb-10">
      <div className="text-center max-w-3xl mx-auto">
        <p className="text-xs sm:text-sm text-amber-400 uppercase tracking-[0.2em] font-semibold mb-4">
          {eyebrow}
        </p>
        <h1 className="text-3xl sm:text-5xl font-bold leading-tight mb-5 bg-gradient-to-br from-white to-white/60 bg-clip-text text-transparent">
          {title}
        </h1>
        <p className="text-sm sm:text-base text-white/70 leading-relaxed mb-8">{subtitle}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <a
            href="/api/auth/discord/start?returnTo=/"
            className="inline-flex items-center gap-2 bg-[#5865F2] hover:bg-[#4752c4] transition-colors px-5 py-2.5 rounded-lg text-sm font-semibold"
          >
            <Sparkles size={16} />
            {ctaPrimary}
          </a>
          <a
            href="#events"
            className="inline-flex items-center gap-1.5 text-white/70 hover:text-white text-sm font-medium px-3 py-2"
          >
            <ChevronRight size={16} />
            {jumpLabel}
          </a>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:gap-6 max-w-2xl mx-auto mt-12 sm:mt-16">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl bg-white/5 border border-white/10 px-3 sm:px-5 py-3 sm:py-4 text-center"
          >
            <div className="text-xl sm:text-3xl font-bold text-amber-400">{s.value}</div>
            <div className="text-[10px] sm:text-xs text-white/50 mt-1">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

function SectionNav({ items }: { items: Array<{ id: string; label: string }> }) {
  return (
    <nav className="my-8 flex flex-wrap gap-2 justify-center sticky top-9 z-30 bg-[#0f1117]/80 backdrop-blur py-2 -mx-4 px-4">
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
    <section id={id} className="scroll-mt-28 py-12 border-t border-white/5">
      <div className="mb-6">
        <h2 className="text-xl sm:text-2xl font-bold mb-2">{title}</h2>
        <p className="text-sm text-white/60 leading-relaxed">{subtitle}</p>
      </div>
      <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-4 sm:p-6">{children}</div>
    </section>
  )
}

function Footer({
  title,
  subtitle,
  cta,
  note,
}: {
  title: string
  subtitle: string
  cta: string
  note: string
}) {
  return (
    <section className="mt-16 rounded-2xl bg-gradient-to-br from-amber-500/15 via-transparent to-amber-500/5 border border-amber-500/20 p-8 sm:p-12 text-center">
      <h3 className="text-xl sm:text-2xl font-bold mb-2">{title}</h3>
      <p className="text-sm text-white/60 mb-6 max-w-md mx-auto">{subtitle}</p>
      <a
        href="/api/auth/discord/start?returnTo=/"
        className="inline-flex items-center gap-2 bg-[#5865F2] hover:bg-[#4752c4] transition-colors px-6 py-3 rounded-lg text-sm font-semibold"
      >
        <ExternalLink size={16} />
        {cta}
      </a>
      <p className="text-[10px] text-white/40 mt-6">{note}</p>
    </section>
  )
}
