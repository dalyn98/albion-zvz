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
} from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { requireAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function AdminGuidePage() {
  await requireAdmin()
  const t = await getTranslations('adminGuide')

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-amber-400">
          <BookOpen size={18} />
          <span className="text-sm font-semibold uppercase tracking-wider">
            {t('eyebrow')}
          </span>
        </div>
        <h1 className="text-2xl font-bold text-white">{t('title')}</h1>
        <p className="text-gray-400 text-sm leading-relaxed max-w-3xl">
          {t('intro')}
        </p>
      </header>

      <GuideSection
        icon={<CalendarDays size={18} className="text-amber-400" />}
        title={t('eventLifecycle.title')}
        href="/admin/dashboard"
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
        icon={<ShieldCheck size={18} className="text-amber-400" />}
        title={t('regear.title')}
        href="/admin/dashboard/settings?tab=events"
        linkLabel={t('regear.cta')}
      >
        <p className="text-sm text-gray-300 leading-relaxed">
          {t('regear.body')}
        </p>
        <ul className="list-disc pl-5 space-y-1.5 text-sm text-gray-300 mt-2">
          <li>{t('regear.bullet1')}</li>
          <li>{t('regear.bullet2')}</li>
          <li>{t('regear.bullet3')}</li>
          <li>{t('regear.bullet4')}</li>
          <li>{t('regear.bullet5')}</li>
        </ul>
      </GuideSection>

      <GuideSection
        icon={<Users size={18} className="text-amber-400" />}
        title={t('onboarding.title')}
        href="/admin/dashboard/settings?tab=events"
        linkLabel={t('onboarding.cta')}
      >
        <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
          {t('onboarding.body')}
        </p>
      </GuideSection>

      <GuideSection
        icon={<Bomb size={18} className="text-rose-400" />}
        title={t('bombSquad.title')}
        href="/admin/dashboard/settings?tab=permissions"
        linkLabel={t('bombSquad.cta')}
      >
        <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
          {t('bombSquad.body')}
        </p>
      </GuideSection>

      <GuideSection
        icon={<Package size={18} className="text-amber-400" />}
        title={t('shop.title')}
        href="/admin/dashboard/shop"
        linkLabel={t('shop.cta')}
      >
        <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
          {t('shop.body')}
        </p>
      </GuideSection>

      <GuideSection
        icon={<Bell size={18} className="text-amber-400" />}
        title={t('notifications.title')}
        href="/admin/dashboard/settings?tab=notices"
        linkLabel={t('notifications.cta')}
      >
        <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
          {t('notifications.body')}
        </p>
      </GuideSection>

      <GuideSection
        icon={<Swords size={18} className="text-amber-400" />}
        title={t('battles.title')}
        href="/battles"
        linkLabel={t('battles.cta')}
      >
        <p className="text-sm text-gray-300 leading-relaxed">
          {t('battles.body')}
        </p>
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
        href="/admin/dashboard/stats"
        linkLabel={t('stats.cta')}
      >
        <p className="text-sm text-gray-300 leading-relaxed">
          {t('stats.body')}
        </p>
      </GuideSection>

      <GuideSection
        icon={<Sparkles size={18} className="text-amber-400" />}
        title={t('tips.title')}
      >
        <ul className="list-disc pl-5 space-y-1.5 text-sm text-gray-300">
          <li>{t('tips.tip1')}</li>
          <li>{t('tips.tip2')}</li>
          <li>{t('tips.tip3')}</li>
          <li>{t('tips.tip4')}</li>
        </ul>
      </GuideSection>
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
        <h2 className="flex items-center gap-2 text-white font-bold text-base">
          {icon}
          {title}
        </h2>
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
