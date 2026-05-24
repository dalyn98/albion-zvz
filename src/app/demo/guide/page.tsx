import Link from 'next/link'
import {
  BookOpen,
  CalendarDays,
  ShieldCheck,
  Users,
  Bomb,
  Sparkles,
  Package,
  Bell,
  BarChart3,
  Swords,
  Globe,
  ListChecks,
  AlertCircle,
  Hammer,
  Rocket,
  CalendarCog,
  ShoppingBag,
  Database,
  Library,
} from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import DemoCTACard from '../_components/DemoCTACard'

// 실 /admin/dashboard/guide 의 1:1 클론 — requireAdmin() 만 빼고 i18n / 카테고리
// 매핑 / GuideSection / TroubleEntry 모두 동일. 데모 알림 배너 + Eternia 헤더
// + 페이지 끝 CTA 카드만 추가. 내부 링크는 데모 라우트로 재매핑한다.

interface CategoryDef {
  id: string
  icon: React.ReactNode
  titleKey: string
  sectionIds: string[]
}

const CATEGORIES: CategoryDef[] = [
  {
    id: 'getting-started',
    icon: <Rocket size={16} className="text-emerald-400" />,
    titleKey: 'gettingStarted',
    sectionIds: ['quickStart'],
  },
  {
    id: 'events',
    icon: <CalendarCog size={16} className="text-amber-400" />,
    titleKey: 'events',
    sectionIds: ['eventLifecycle', 'onboarding', 'timezone', 'bombSquad'],
  },
  {
    id: 'regear',
    icon: <ShieldCheck size={16} className="text-amber-400" />,
    titleKey: 'regear',
    sectionIds: ['regear', 'craftRegear'],
  },
  {
    id: 'community',
    icon: <ShoppingBag size={16} className="text-amber-400" />,
    titleKey: 'community',
    sectionIds: ['shop', 'notifications'],
  },
  {
    id: 'data',
    icon: <Database size={16} className="text-amber-400" />,
    titleKey: 'data',
    sectionIds: ['battles', 'stats'],
  },
  {
    id: 'reference',
    icon: <Library size={16} className="text-amber-400" />,
    titleKey: 'reference',
    sectionIds: ['tips', 'troubleshooting'],
  },
]

// 실 가이드의 href 를 데모 라우트로 매핑. 동일 라우트가 데모에 존재하면
// /demo/* 로 재바인딩, 없으면 데모 홈으로 (가이드의 CTA 가 "어디로 가는지"
// 안 보이는 일이 없게).
const DEMO_HREF = {
  settingsGuild: '/demo/settings?tab=guild',
  settingsEvents: '/demo/settings?tab=events',
  settingsRegear: '/demo/settings?tab=regear',
  dashboard: '/demo',
  settingsPermissions: '/demo/settings?tab=permissions',
  craft: '/demo/craft',
  shop: '/demo/shop',
  battles: '/demo/battles',
  stats: '/demo/stats',
} as const

export default async function DemoGuidePage() {
  const [t, tCat, tDemoMe, tDemoGuide, tCta] = await Promise.all([
    getTranslations('adminGuide'),
    getTranslations('adminGuide.category'),
    getTranslations('demo.me'),
    getTranslations('demo.guide'),
    getTranslations('demo.ctaCard'),
  ])

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-amber-400">
            <BookOpen size={18} />
            <span className="text-sm font-semibold uppercase tracking-wider">{t('eyebrow')}</span>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-200 border border-amber-400/40 uppercase tracking-wider">
            <Sparkles size={11} />
            {tDemoMe('viewingAsEyebrow')}
          </span>
        </div>
        <h1 className="text-2xl font-bold text-white">{t('title')}</h1>
        <p className="text-gray-400 text-sm leading-relaxed max-w-3xl">{t('intro')}</p>
      </header>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-start gap-2.5">
        <Sparkles size={16} className="text-amber-400 shrink-0 mt-0.5" />
        <p className="text-amber-200 text-sm">{tDemoGuide('notice')}</p>
      </div>

      <nav className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        <h2 className="text-white text-sm font-bold flex items-center gap-1.5">
          <ListChecks size={14} className="text-amber-300" />
          {t('toc.title')}
        </h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
          {CATEGORIES.map((cat) => (
            <li key={cat.id}>
              <a
                href={`#${cat.id}`}
                className="flex items-center gap-2 rounded-md border border-gray-800 bg-gray-950/50 px-3 py-2 text-sm text-gray-300 hover:border-amber-500/30 hover:text-amber-200 transition-colors"
              >
                {cat.icon}
                <span className="truncate">{tCat(cat.titleKey)}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <section id="getting-started" className="space-y-3 scroll-mt-20">
        <CategoryHeader icon={CATEGORIES[0].icon} title={tCat('gettingStarted')} />
        <GuideSection
          icon={<ListChecks size={18} className="text-emerald-400" />}
          title={t('quickStart.title')}
          href={DEMO_HREF.settingsGuild}
          linkLabel={t('quickStart.cta')}
        >
          <p className="text-sm text-gray-300 leading-relaxed mb-3">{t('quickStart.intro')}</p>
          <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-300">
            <li>{t('quickStart.step1')}</li>
            <li>{t('quickStart.step2')}</li>
            <li>{t('quickStart.step3')}</li>
            <li>{t('quickStart.step4')}</li>
            <li>{t('quickStart.step5')}</li>
            <li>{t('quickStart.step6')}</li>
            <li>{t('quickStart.step7')}</li>
          </ol>
        </GuideSection>
      </section>

      <section id="events" className="space-y-3 scroll-mt-20">
        <CategoryHeader icon={CATEGORIES[1].icon} title={tCat('events')} />
        <GuideSection
          icon={<CalendarDays size={18} className="text-amber-400" />}
          title={t('eventLifecycle.title')}
          href={DEMO_HREF.dashboard}
          linkLabel={t('eventLifecycle.cta')}
        >
          <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-300">
            <li>{t('eventLifecycle.step1')}</li>
            <li>{t('eventLifecycle.step2')}</li>
            <li>{t('eventLifecycle.step3')}</li>
            <li>{t('eventLifecycle.step4')}</li>
            <li>{t('eventLifecycle.step5')}</li>
          </ol>
        </GuideSection>

        <GuideSection
          icon={<Users size={18} className="text-amber-400" />}
          title={t('onboarding.title')}
          href={DEMO_HREF.settingsGuild}
          linkLabel={t('onboarding.cta')}
        >
          <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
            {t('onboarding.body')}
          </p>
        </GuideSection>

        <GuideSection
          icon={<Globe size={18} className="text-amber-400" />}
          title={t('timezone.title')}
          href={DEMO_HREF.settingsGuild}
          linkLabel={t('timezone.cta')}
        >
          <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
            {t('timezone.body')}
          </p>
        </GuideSection>

        <GuideSection
          icon={<Bomb size={18} className="text-rose-400" />}
          title={t('bombSquad.title')}
          href={DEMO_HREF.settingsPermissions}
          linkLabel={t('bombSquad.cta')}
        >
          <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
            {t('bombSquad.body')}
          </p>
        </GuideSection>
      </section>

      <section id="regear" className="space-y-3 scroll-mt-20">
        <CategoryHeader icon={CATEGORIES[2].icon} title={tCat('regear')} />
        <GuideSection
          icon={<ShieldCheck size={18} className="text-amber-400" />}
          title={t('regear.title')}
          href={DEMO_HREF.settingsRegear}
          linkLabel={t('regear.cta')}
        >
          <p className="text-sm text-gray-300 leading-relaxed">{t('regear.body')}</p>
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-gray-300 mt-2">
            <li>{t('regear.bullet1')}</li>
            <li>{t('regear.bullet2')}</li>
            <li>{t('regear.bullet3')}</li>
            <li>{t('regear.bullet4')}</li>
            <li>{t('regear.bullet5')}</li>
          </ul>
        </GuideSection>

        <GuideSection
          icon={<Hammer size={18} className="text-amber-400" />}
          title={t('craftRegear.title')}
          href={DEMO_HREF.craft}
          linkLabel={t('craftRegear.cta')}
        >
          <p className="text-sm text-gray-300 leading-relaxed">{t('craftRegear.body')}</p>
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-gray-300 mt-2">
            <li>{t('craftRegear.bullet1')}</li>
            <li>{t('craftRegear.bullet2')}</li>
            <li>{t('craftRegear.bullet3')}</li>
            <li>{t('craftRegear.bullet4')}</li>
            <li>{t('craftRegear.bullet5')}</li>
          </ul>
        </GuideSection>
      </section>

      <section id="community" className="space-y-3 scroll-mt-20">
        <CategoryHeader icon={CATEGORIES[3].icon} title={tCat('community')} />
        <GuideSection
          icon={<Package size={18} className="text-amber-400" />}
          title={t('shop.title')}
          href={DEMO_HREF.shop}
          linkLabel={t('shop.cta')}
        >
          <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
            {t('shop.body')}
          </p>
        </GuideSection>

        <GuideSection
          icon={<Bell size={18} className="text-amber-400" />}
          title={t('notifications.title')}
          href={DEMO_HREF.settingsEvents}
          linkLabel={t('notifications.cta')}
        >
          <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
            {t('notifications.body')}
          </p>
        </GuideSection>
      </section>

      <section id="data" className="space-y-3 scroll-mt-20">
        <CategoryHeader icon={CATEGORIES[4].icon} title={tCat('data')} />
        <GuideSection
          icon={<Swords size={18} className="text-amber-400" />}
          title={t('battles.title')}
          href={DEMO_HREF.battles}
          linkLabel={t('battles.cta')}
        >
          <p className="text-sm text-gray-300 leading-relaxed">{t('battles.body')}</p>
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-gray-300 mt-2">
            <li>{t('battles.bullet1')}</li>
            <li>{t('battles.bullet2')}</li>
            <li>{t('battles.bullet3')}</li>
            <li>{t('battles.bullet4')}</li>
          </ul>
        </GuideSection>

        <GuideSection
          icon={<BarChart3 size={18} className="text-amber-400" />}
          title={t('stats.title')}
          href={DEMO_HREF.stats}
          linkLabel={t('stats.cta')}
        >
          <p className="text-sm text-gray-300 leading-relaxed">{t('stats.body')}</p>
        </GuideSection>
      </section>

      <section id="reference" className="space-y-3 scroll-mt-20">
        <CategoryHeader icon={CATEGORIES[5].icon} title={tCat('reference')} />
        <GuideSection
          icon={<Sparkles size={18} className="text-amber-400" />}
          title={t('tips.title')}
        >
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-gray-300">
            <li>{t('tips.tip1')}</li>
            <li>{t('tips.tip2')}</li>
            <li>{t('tips.tip3')}</li>
            <li>{t('tips.tip4')}</li>
            <li>{t('tips.tip5')}</li>
            <li>{t('tips.tip6')}</li>
            <li>{t('tips.tip7')}</li>
          </ul>
        </GuideSection>

        <GuideSection
          icon={<AlertCircle size={18} className="text-rose-400" />}
          title={t('troubleshooting.title')}
        >
          <p className="text-sm text-gray-300 leading-relaxed mb-3">
            {t('troubleshooting.intro')}
          </p>
          <dl className="space-y-3 text-sm">
            <TroubleEntry term={t('troubleshooting.p1Title')} desc={t('troubleshooting.p1Body')} />
            <TroubleEntry term={t('troubleshooting.p2Title')} desc={t('troubleshooting.p2Body')} />
            <TroubleEntry term={t('troubleshooting.p3Title')} desc={t('troubleshooting.p3Body')} />
            <TroubleEntry term={t('troubleshooting.p4Title')} desc={t('troubleshooting.p4Body')} />
            <TroubleEntry term={t('troubleshooting.p5Title')} desc={t('troubleshooting.p5Body')} />
            <TroubleEntry term={t('troubleshooting.p6Title')} desc={t('troubleshooting.p6Body')} />
            <TroubleEntry term={t('troubleshooting.p7Title')} desc={t('troubleshooting.p7Body')} />
          </dl>
        </GuideSection>
      </section>

      <DemoCTACard
        eyebrow={tCta('eyebrow')}
        title={tDemoGuide('ctaTitle')}
        description={tDemoGuide('ctaDescription')}
        buttonLabel={tCta('buttonLabel')}
      />
    </div>
  )
}

interface CategoryHeaderProps {
  icon: React.ReactNode
  title: string
}

function CategoryHeader({ icon, title }: CategoryHeaderProps) {
  return (
    <div className="flex items-center gap-2 border-l-2 border-amber-500/40 pl-3 py-1">
      {icon}
      <h2 className="text-amber-200 text-sm font-bold uppercase tracking-wider">{title}</h2>
    </div>
  )
}

interface TroubleEntryProps {
  term: string
  desc: string
}

function TroubleEntry({ term, desc }: TroubleEntryProps) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-3">
      <dt className="text-white font-semibold mb-1">{term}</dt>
      <dd className="text-gray-300 leading-relaxed">{desc}</dd>
    </div>
  )
}

interface GuideSectionProps {
  icon: React.ReactNode
  title: string
  href?: string
  linkLabel?: string
  children: React.ReactNode
}

function GuideSection({ icon, title, href, linkLabel, children }: GuideSectionProps) {
  return (
    <section className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-white font-bold text-base">
          {icon}
          {title}
        </h3>
        {href && linkLabel && (
          <Link
            href={href}
            className="text-xs text-amber-300 hover:text-amber-200 whitespace-nowrap"
          >
            {linkLabel} →
          </Link>
        )}
      </div>
      <div>{children}</div>
    </section>
  )
}
