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
// 디자인: 실제 admin 화면 톤 (bg-gray-900 카드 / amber 액센트 / gray-700 보더)
// 을 그대로 사용. 마케팅 톤 (gradient hero, white/0.05) 사용 금지.
//
// 주의: `force-static` 을 쓰지 않는다. layout 이 x-pathname 헤더로 isPublic
// 분기를 결정하는데, static prerender 는 빌드 타임에 헤더 없이 렌더돼 AppGate
// 가 HTML 에 박혀버린다.
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
    <div className="min-h-screen bg-[#0b0d12] text-white">
      <div className="sticky top-0 z-40 bg-amber-500 text-black text-center text-xs sm:text-sm font-semibold py-2 px-4">
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
    <section className="pt-12 sm:pt-16 pb-8">
      <div className="max-w-3xl">
        <p className="text-[11px] sm:text-xs text-amber-400 uppercase tracking-[0.2em] font-semibold mb-3">
          {eyebrow}
        </p>
        <h1 className="text-2xl sm:text-4xl font-bold text-white leading-tight mb-4">{title}</h1>
        <p className="text-sm sm:text-base text-gray-400 leading-relaxed mb-6">{subtitle}</p>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href="/api/auth/discord/start?returnTo=/"
            className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 transition-colors px-5 py-2.5 rounded-lg text-sm font-bold text-black"
          >
            <Sparkles size={16} />
            {ctaPrimary}
          </a>
          <a
            href="#events"
            className="inline-flex items-center gap-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-700 hover:border-gray-600 transition-colors text-gray-300 hover:text-white text-sm font-medium px-4 py-2.5 rounded-lg"
          >
            <ChevronRight size={16} />
            {jumpLabel}
          </a>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mt-10 sm:mt-12 max-w-2xl">
        {stats.map((s) => (
          <div
            key={s.label}
            className="bg-gray-900 border border-gray-800 rounded-lg px-3 sm:px-4 py-3"
          >
            <div className="text-lg sm:text-2xl font-bold text-amber-400 font-mono">{s.value}</div>
            <div className="text-[10px] sm:text-xs text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

function SectionNav({ items }: { items: Array<{ id: string; label: string }> }) {
  return (
    <nav className="my-6 flex flex-wrap gap-2 sticky top-9 z-30 bg-[#0b0d12]/95 backdrop-blur py-2 -mx-4 px-4 border-b border-gray-800">
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className="text-xs sm:text-sm bg-gray-900 hover:bg-gray-800 border border-gray-700 hover:border-amber-500/40 hover:text-amber-300 rounded-full px-3 py-1.5 text-gray-300 transition-colors"
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
    <section id={id} className="scroll-mt-28 py-8 sm:py-10">
      <div className="flex items-center justify-between gap-2 border-b border-gray-800 pb-2 mb-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-white">{title}</h2>
          <p className="text-xs text-gray-500 leading-relaxed mt-1">{subtitle}</p>
        </div>
      </div>
      <div>{children}</div>
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
    <section className="mt-16 bg-gray-900 border border-gray-800 rounded-xl p-6 sm:p-10">
      <h3 className="text-lg sm:text-xl font-bold text-white mb-2">{title}</h3>
      <p className="text-sm text-gray-400 mb-5 max-w-md">{subtitle}</p>
      <a
        href="/api/auth/discord/start?returnTo=/"
        className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 transition-colors px-5 py-2.5 rounded-lg text-sm font-bold text-black"
      >
        <ExternalLink size={16} />
        {cta}
      </a>
      <p className="text-[11px] text-gray-500 mt-5">{note}</p>
    </section>
  )
}
