import type { Metadata } from 'next'
import MarketingNav from '@/components/MarketingNav'
import ScrollWorldPrototype, {
  type ScrollWorldPrototypeScene,
} from '@/components/ScrollWorldPrototype'
import { getMarketingPathsForEnvironment } from '@/lib/marketing-paths'
import {
  getMarketingLocale,
  getMarketingTranslator,
} from '@/lib/marketing-static-intl'

export const revalidate = 3600

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMarketingTranslator('scrollWorldPrototype')
  return {
    title: t('metadataTitle'),
    description: t('metadataDescription'),
    robots: { index: false, follow: false },
  }
}

export default async function ScrollWorldPrototypePage() {
  const [locale, t, tLanding] = await Promise.all([
    getMarketingLocale(),
    getMarketingTranslator('scrollWorldPrototype'),
    getMarketingTranslator('publicLanding'),
  ])
  const paths = getMarketingPathsForEnvironment(locale)
  const scenes: ScrollWorldPrototypeScene[] = [
    {
      id: 'war-room',
      eyebrow: t('scene1Eyebrow'),
      title: t('scene1Title'),
      body: t('scene1Body'),
      counter: t('counterLabel', { current: '01', total: '04' }),
      tags: [t('scene1Tag1'), t('scene1Tag2'), t('scene1Tag3')],
      image: '/world-prototype/mass-up-v3.webp',
      imageAlt: t('scene1ImageAlt'),
      accent: '#f59e0b',
    },
    {
      id: 'battlefield',
      eyebrow: t('scene2Eyebrow'),
      title: t('scene2Title'),
      body: t('scene2Body'),
      counter: t('counterLabel', { current: '02', total: '04' }),
      tags: [t('scene2Tag1'), t('scene2Tag2'), t('scene2Tag3')],
      image: '/world-prototype/zvz-clash-v3.webp',
      imageAlt: t('scene2ImageAlt'),
      accent: '#60a5fa',
    },
    {
      id: 'supply-workshop',
      eyebrow: t('scene3Eyebrow'),
      title: t('scene3Title'),
      body: t('scene3Body'),
      counter: t('counterLabel', { current: '03', total: '04' }),
      tags: [t('scene3Tag1'), t('scene3Tag2'), t('scene3Tag3')],
      image: '/world-prototype/battle-aftermath-v3.webp',
      imageAlt: t('scene3ImageAlt'),
      accent: '#fb923c',
    },
    {
      id: 'guild-hall',
      eyebrow: t('scene4Eyebrow'),
      title: t('scene4Title'),
      body: t('scene4Body'),
      counter: t('counterLabel', { current: '04', total: '04' }),
      tags: [t('scene4Tag1'), t('scene4Tag2'), t('scene4Tag3')],
      image: '/world-prototype/redeploy-v3.webp',
      imageAlt: t('scene4ImageAlt'),
      accent: '#4ade80',
    },
  ]

  return (
    <>
      <MarketingNav />
      <main className="bg-[#05070b] text-white">
        <ScrollWorldPrototype
          brandName={tLanding('siteName')}
          badge={t('prototypeBadge')}
          scrollHint={t('scrollHint')}
          progressLabel={t('progressLabel')}
          installHref="/login?returnTo=%2Fonboard"
          demoHref={paths.demo}
          installLabel={t('installCta')}
          demoLabel={t('demoCta')}
          scenes={scenes}
        />
      </main>
    </>
  )
}
