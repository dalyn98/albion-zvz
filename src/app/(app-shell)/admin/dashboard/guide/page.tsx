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
  ScrollText,
  Zap,
} from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { canAccessAdminPath, canAccessAnyOfficerAdminRoute } from '@/lib/admin-route-access'
import { getSession, sessionHasAny, type SessionPayload } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { CAP } from '@/lib/permissions'
import {
  isGuildFeatureDiscoverable,
  resolveGuildFeatureForPathname,
  type GuildFeatureSnapshot,
} from '@/lib/guild-features'
import { loadGuildFeatureSnapshot } from '@/lib/guild-features-server'
import {
  ADMIN_GUIDE_CATEGORIES,
  AdminGuideCategoryHeader as CategoryHeader,
  AdminGuideSection as GuideSection,
  AdminGuideToc,
  AdminGuideTroubleEntry as TroubleEntry,
} from '@/components/AdminGuidePrimitives'

export const dynamic = 'force-dynamic'

interface GuideCta {
  href?: string
  linkLabel: string
  linkUnavailable?: boolean
}

function resolveGuideCta(input: {
  href: string
  label: string
  session: SessionPayload
  snapshot: GuildFeatureSnapshot
  permissionRequiredLabel: string
  featureDisabledLabel: string
  enableFeatureLabel: string
}): GuideCta {
  if (
    input.href.startsWith('/admin/dashboard') &&
    !canAccessAdminPath(input.href, input.session.isAdmin, input.session.capabilities)
  ) {
    return {
      linkLabel: input.permissionRequiredLabel,
      linkUnavailable: true,
    }
  }

  const featureKey = resolveGuildFeatureForPathname(input.href)
  if (featureKey && !isGuildFeatureDiscoverable(input.snapshot[featureKey].state)) {
    const canConfigure = input.session.isAdmin || sessionHasAny(input.session, [CAP.SETTINGS_TOGGLES])
    if (!canConfigure) {
      return {
        linkLabel: input.featureDisabledLabel,
        linkUnavailable: true,
      }
    }
    return {
      href: featureKey === 'supply'
        ? '/admin/dashboard/settings?tab=regear'
        : `/admin/dashboard/settings?tab=features&feature=${featureKey}`,
      linkLabel: input.enableFeatureLabel,
    }
  }

  return { href: input.href, linkLabel: input.label }
}

// 카테고리 → 섹션 매핑. 카테고리 헤더 ID 는 anchor link, 섹션 ID 는 카테고리
// 안에서의 jump anchor 로 쓴다. 새 섹션 추가 시 sections 배열에만 더하면
// 본문 렌더링 + TOC 가 함께 따라온다.
export default async function AdminGuidePage() {
  const session = await getSession()
  if (!canAccessAnyOfficerAdminRoute(session?.isAdmin ?? false, session?.capabilities)) {
    notFound()
  }
  if (!session) notFound()
  const guildId = await getSessionGuildId(session)
  const [t, tCat, featureSnapshot] = await Promise.all([
    getTranslations('adminGuide'),
    getTranslations('adminGuide.category'),
    loadGuildFeatureSnapshot(guildId),
  ])
  const cta = (href: string, label: string): GuideCta => resolveGuideCta({
    href,
    label,
    session,
    snapshot: featureSnapshot,
    permissionRequiredLabel: t('ctaPermissionRequired'),
    featureDisabledLabel: t('ctaFeatureDisabled'),
    enableFeatureLabel: t('ctaEnableFeature'),
  })

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

      <AdminGuideToc title={t('toc.title')} titleFor={(key) => tCat(key)} />

      <section id="getting-started" className="space-y-3 scroll-mt-20">
        <CategoryHeader icon={ADMIN_GUIDE_CATEGORIES[0].icon} title={tCat('gettingStarted')} />
        <GuideSection
          icon={<ListChecks size={18} className="text-emerald-400" />}
          title={t('quickStart.title')}
          {...cta('/admin/dashboard/settings?tab=guild', t('quickStart.cta'))}
        >
          <p className="text-sm text-gray-300 leading-relaxed mb-3">
            {t('quickStart.intro')}
          </p>
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

        <GuideSection
          icon={<Users size={18} className="text-emerald-400" />}
          title={t('roleLoops.title')}
          {...cta('/admin/dashboard/permissions', t('roleLoops.cta'))}
        >
          <p className="text-sm text-gray-300 leading-relaxed mb-3">
            {t('roleLoops.intro')}
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-gray-300">
            <li>{t('roleLoops.eventLead')}</li>
            <li>{t('roleLoops.regearOfficer')}</li>
            <li>{t('roleLoops.financeOfficer')}</li>
            <li>{t('roleLoops.supplyOfficer')}</li>
            <li>{t('roleLoops.analyst')}</li>
          </ul>
        </GuideSection>
      </section>

      <section id="events" className="space-y-3 scroll-mt-20">
        <CategoryHeader icon={ADMIN_GUIDE_CATEGORIES[1].icon} title={tCat('events')} />
        <GuideSection
          icon={<CalendarDays size={18} className="text-amber-400" />}
          title={t('eventLifecycle.title')}
          {...cta('/admin/dashboard', t('eventLifecycle.cta'))}
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
          {...cta('/admin/dashboard/settings?tab=guild', t('onboarding.cta'))}
        >
          <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
            {t('onboarding.body')}
          </p>
        </GuideSection>

        <GuideSection
          icon={<Globe size={18} className="text-amber-400" />}
          title={t('timezone.title')}
          {...cta('/admin/dashboard/settings?tab=guild', t('timezone.cta'))}
        >
          <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
            {t('timezone.body')}
          </p>
        </GuideSection>

        <GuideSection
          icon={<Bomb size={18} className="text-rose-400" />}
          title={t('bombSquad.title')}
          {...cta('/admin/dashboard/permissions', t('bombSquad.cta'))}
        >
          <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
            {t('bombSquad.body')}
          </p>
        </GuideSection>
      </section>

      <section id="regear" className="space-y-3 scroll-mt-20">
        <CategoryHeader icon={ADMIN_GUIDE_CATEGORIES[2].icon} title={tCat('regear')} />
        <GuideSection
          icon={<ShieldCheck size={18} className="text-amber-400" />}
          title={t('regear.title')}
          {...cta('/admin/dashboard/settings?tab=regear', t('regear.cta'))}
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
          icon={<Hammer size={18} className="text-amber-400" />}
          title={t('craftRegear.title')}
          {...cta('/admin/dashboard/craft', t('craftRegear.cta'))}
        >
          <p className="text-sm text-gray-300 leading-relaxed">
            {t('craftRegear.body')}
          </p>
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
        <CategoryHeader icon={ADMIN_GUIDE_CATEGORIES[3].icon} title={tCat('community')} />
        <GuideSection
          icon={<Package size={18} className="text-amber-400" />}
          title={t('shop.title')}
          {...cta('/admin/dashboard/shop', t('shop.cta'))}
        >
          <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
            {t('shop.body')}
          </p>
        </GuideSection>

        <GuideSection
          icon={<Zap size={18} className="text-amber-400" />}
          title={t('siphon.title')}
          {...cta('/admin/dashboard/siphon', t('siphon.cta'))}
        >
          <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
            {t('siphon.body')}
          </p>
        </GuideSection>

        <GuideSection
          icon={<ScrollText size={18} className="text-amber-400" />}
          title={t('lootAudit.title')}
          {...cta('/admin/dashboard/loot-audit', t('lootAudit.cta'))}
        >
          <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
            {t('lootAudit.body')}
          </p>
        </GuideSection>

        <GuideSection
          icon={<Bell size={18} className="text-amber-400" />}
          title={t('notifications.title')}
          {...cta('/admin/dashboard/settings?tab=events', t('notifications.cta'))}
        >
          <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
            {t('notifications.body')}
          </p>
        </GuideSection>
      </section>

      <section id="data" className="space-y-3 scroll-mt-20">
        <CategoryHeader icon={ADMIN_GUIDE_CATEGORIES[4].icon} title={tCat('data')} />
        <GuideSection
          icon={<Swords size={18} className="text-amber-400" />}
          title={t('battles.title')}
          {...cta('/battles', t('battles.cta'))}
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
          {...cta('/admin/dashboard/stats', t('stats.cta'))}
        >
          <p className="text-sm text-gray-300 leading-relaxed">
            {t('stats.body')}
          </p>
        </GuideSection>
      </section>

      <section id="reference" className="space-y-3 scroll-mt-20">
        <CategoryHeader icon={ADMIN_GUIDE_CATEGORIES[5].icon} title={tCat('reference')} />
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
    </div>
  )
}
