import { Calendar, Coins, ShoppingBag, BarChart3, Check } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import MarketingNav from '@/components/MarketingNav'
import ScreenshotPlaceholder from '@/components/ScreenshotPlaceholder'

export const dynamic = 'force-dynamic'

interface FeatureSection {
  // 텍스트가 좌측에 오는지 우측에 오는지. 4개 섹션을 번갈아 배치해 시각적
  // 단조로움을 줄인다.
  imagePosition: 'left' | 'right'
  icon: typeof Calendar
  title: string
  body: string
  bullets: string[]
  screenshotLabel: string
}

export default async function PublicFeaturesPage() {
  const t = await getTranslations('publicFeatures')

  const sections: FeatureSection[] = [
    {
      imagePosition: 'right',
      icon: Calendar,
      title: t('f1Title'),
      body: t('f1Body'),
      bullets: [t('f1Bullet1'), t('f1Bullet2'), t('f1Bullet3')],
      screenshotLabel: t('f1ScreenshotLabel'),
    },
    {
      imagePosition: 'left',
      icon: Coins,
      title: t('f2Title'),
      body: t('f2Body'),
      bullets: [t('f2Bullet1'), t('f2Bullet2'), t('f2Bullet3')],
      screenshotLabel: t('f2ScreenshotLabel'),
    },
    {
      imagePosition: 'right',
      icon: ShoppingBag,
      title: t('f3Title'),
      body: t('f3Body'),
      bullets: [t('f3Bullet1'), t('f3Bullet2'), t('f3Bullet3')],
      screenshotLabel: t('f3ScreenshotLabel'),
    },
    {
      imagePosition: 'left',
      icon: BarChart3,
      title: t('f4Title'),
      body: t('f4Body'),
      bullets: [t('f4Bullet1'), t('f4Bullet2'), t('f4Bullet3')],
      screenshotLabel: t('f4ScreenshotLabel'),
    },
  ]

  return (
    <>
      <MarketingNav active="features" />
      <div className="bg-[#0f1117] text-white">
        <div className="mx-auto max-w-5xl px-5 sm:px-8 py-12 sm:py-16 space-y-16 sm:space-y-20">
          <section className="text-center space-y-4">
            <p className="text-xs sm:text-sm uppercase tracking-[0.2em] text-amber-300/80">
              {t('pageSubtitle')}
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold leading-tight">{t('pageHeading')}</h1>
            <p className="text-sm sm:text-base text-gray-300 max-w-2xl mx-auto leading-relaxed">
              {t('pageLead')}
            </p>
          </section>

          {sections.map((section) => (
            <section
              key={section.title}
              className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10 items-center"
            >
              <div
                className={`space-y-3 ${section.imagePosition === 'left' ? 'md:order-2' : ''}`}
              >
                <div className="flex items-center gap-2 text-amber-300">
                  <section.icon size={18} />
                  <span className="text-xs uppercase tracking-wider font-semibold">
                    {section.title}
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-white leading-snug">
                  {section.title}
                </h2>
                <p className="text-sm text-gray-300 leading-relaxed">{section.body}</p>
                <ul className="space-y-1.5 pt-1">
                  {section.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2 text-sm text-gray-200">
                      <Check size={14} className="text-amber-300 mt-0.5 flex-shrink-0" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className={section.imagePosition === 'left' ? 'md:order-1' : ''}>
                <ScreenshotPlaceholder label={section.screenshotLabel} aspect="4/3" />
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  )
}
