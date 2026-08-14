import Link from 'next/link'
import {
  Bot,
  CalendarPlus,
  HelpCircle,
  PlayCircle,
  ShieldCheck,
  UserCheck,
} from 'lucide-react'
import DocsMyGuildLink from '@/components/DocsMyGuildLink'
import { getMarketingPathsForEnvironment, resolveMarketingHref } from '@/lib/marketing-paths'
import { getMarketingLocale, getMarketingTranslator } from '@/lib/marketing-static-intl'

const QUICK_START_KEYS = [
  'quickStartStep1',
  'quickStartStep2',
  'quickStartStep3',
  'quickStartStep4',
] as const

const MINIMUM_GUIDE_CARDS = [
  {
    icon: Bot,
    titleKey: 'botPermissionsTitle',
    bodyKey: 'botPermissionsBody',
    href: '/docs/onboarding/invite',
  },
  {
    icon: UserCheck,
    titleKey: 'memberVerificationTitle',
    bodyKey: 'memberVerificationBody',
    href: '/docs/onboarding/character-link',
  },
  {
    icon: CalendarPlus,
    titleKey: 'firstEventTitle',
    bodyKey: 'firstEventBody',
    href: '/docs/events/create',
  },
  {
    icon: ShieldCheck,
    titleKey: 'regearRulesTitle',
    bodyKey: 'regearRulesBody',
    href: '/docs/regear/auto',
  },
] as const

const DEEP_DOC_CARDS = [
  {
    titleKey: 'onboardingCardTitle',
    bodyKey: 'onboardingCardBody',
    href: '/docs/onboarding',
  },
  {
    titleKey: 'eventsCardTitle',
    bodyKey: 'eventsCardBody',
    href: '/docs/events',
  },
  {
    titleKey: 'regearCardTitle',
    bodyKey: 'regearCardBody',
    href: '/docs/regear',
  },
  {
    titleKey: 'faqCardTitle',
    bodyKey: 'faqCardBody',
    href: '/faq',
  },
] as const

export default async function LocalizedDocsHome() {
  const [locale, t] = await Promise.all([
    getMarketingLocale(),
    getMarketingTranslator('publicDocsHome'),
  ])
  const paths = getMarketingPathsForEnvironment(locale)

  return (
    <div className="space-y-9">
      <header className="space-y-4">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-300">
          {t('eyebrow')}
        </p>
        <div className="space-y-3">
          <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl">
            {t('title')}
          </h1>
          <p className="text-base leading-relaxed text-gray-300">
            {t('lead')}
          </p>
          <p className="text-sm leading-relaxed text-gray-400">
            {t('memberPromise')}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <a
            href="/login?returnTo=%2Fonboard"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#5865F2] px-5 text-sm font-semibold text-[#fff] transition-colors hover:bg-[#4752c4]"
          >
            <Bot size={16} />
            {t('installCta')}
          </a>
          <Link
            href={paths.demo}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-gray-700 bg-gray-900/80 px-5 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
          >
            <PlayCircle size={16} />
            {t('demoCta')}
          </Link>
          <Link
            href={resolveMarketingHref(paths, '/docs/current-contract')}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-5 text-sm font-semibold text-emerald-100 transition-colors hover:bg-emerald-400/15"
          >
            <ShieldCheck size={16} />
            {t('currentContractCta')}
          </Link>
        </div>
      </header>

      <DocsMyGuildLink />

      <section className="rounded-xl border border-amber-400/25 bg-amber-500/5 p-5">
        <h2 className="text-xl font-bold text-white">{t('quickStartTitle')}</h2>
        <p className="mt-2 text-sm leading-relaxed text-amber-100/75">
          {t('quickStartLead')}
        </p>
        <ol className="mt-5 grid gap-3 sm:grid-cols-2">
          {QUICK_START_KEYS.map((key, index) => (
            <li key={key} className="rounded-lg border border-white/10 bg-black/20 p-4">
              <span className="font-mono text-xs font-black text-amber-300/80">
                {String(index + 1).padStart(2, '0')}
              </span>
              <p className="mt-2 text-sm leading-relaxed text-gray-200">{t(key)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-white">{t('minimumSetTitle')}</h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-300">
            {t('minimumSetLead')}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {MINIMUM_GUIDE_CARDS.map((card) => {
            const Icon = card.icon
            return (
              <Link
                key={card.href}
                href={resolveMarketingHref(paths, card.href)}
                className="group rounded-xl border border-gray-800 bg-gray-900/50 p-4 transition-colors hover:border-amber-400/50 hover:bg-amber-500/5"
              >
                <Icon size={18} className="text-amber-300" />
                <h3 className="mt-3 text-base font-bold text-white group-hover:text-amber-100">
                  {t(card.titleKey)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-400">
                  {t(card.bodyKey)}
                </p>
              </Link>
            )
          })}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-white">{t('deepDocsTitle')}</h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-300">
            {t('deepDocsLead')}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {DEEP_DOC_CARDS.map((card) => (
            <Link
              key={card.href}
              href={resolveMarketingHref(paths, card.href)}
              className="rounded-lg border border-gray-800 bg-gray-900/40 p-4 transition-colors hover:border-sky-400/50 hover:bg-sky-400/5"
            >
              <h3 className="text-base font-bold text-sky-100">{t(card.titleKey)}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-gray-400">
                {t(card.bodyKey)}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-sky-400/25 bg-sky-400/5 p-5">
        <div className="flex items-start gap-3">
          <HelpCircle size={20} className="mt-0.5 shrink-0 text-sky-300" />
          <div>
            <h2 className="text-lg font-bold text-white">{t('operatingQuestionsTitle')}</h2>
            <p className="mt-2 text-sm leading-relaxed text-sky-100/75">
              {t('operatingQuestionsBody')}
            </p>
            <Link
              href={paths.faq}
              className="mt-4 inline-flex min-h-10 items-center justify-center rounded-lg bg-sky-300 px-4 text-sm font-semibold text-slate-950 transition-colors hover:bg-sky-200"
            >
              {t('faqCta')}
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
