import Link from 'next/link'
import { getMarketingPathsForEnvironment } from '@/lib/marketing-paths'
import { getMarketingLocale, getMarketingTranslator } from '@/lib/marketing-static-intl'

export default async function MarketingFooter() {
  const [locale, t] = await Promise.all([
    getMarketingLocale(),
    getMarketingTranslator('publicNav'),
  ])
  const paths = getMarketingPathsForEnvironment(locale)
  const year = new Date().getFullYear()
  const linkClassName = 'inline-flex min-h-10 min-w-10 items-center hover:text-white transition-colors'

  return (
    <footer className="border-t border-white/5 bg-[#0a0c11] mt-16">
      <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-gray-500">
        <div className="flex items-center gap-2">
          <span className="text-amber-400/80">⚔</span>
          <span className="font-semibold text-gray-300">Albion Guild Manager</span>
          <span className="text-gray-600">© {year}</span>
        </div>
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <li>
            <Link href={paths.home} className={linkClassName} data-mobile-touch-target>
              {t('home')}
            </Link>
          </li>
          <li>
            <Link href={paths.features} className={linkClassName} data-mobile-touch-target>
              {t('features')}
            </Link>
          </li>
          <li>
            <Link href={paths.zvzBattles} className={linkClassName} data-mobile-touch-target>
              {t('battles')}
            </Link>
          </li>
          <li>
            <Link href={paths.pricing} className={linkClassName} data-mobile-touch-target>
              {t('pricing')}
            </Link>
          </li>
          <li>
            <Link href={paths.docs} className={linkClassName} data-mobile-touch-target>
              {t('docs')}
            </Link>
          </li>
          <li>
            <Link href={paths.demo} className={linkClassName} data-mobile-touch-target>
              {t('demo')}
            </Link>
          </li>
          <li>
            <Link href={paths.faq} className={linkClassName} data-mobile-touch-target>
              {t('faq')}
            </Link>
          </li>
          <li>
            <a
              href="https://discord.gg/pJ8EsybBjm"
              target="_blank"
              rel="noopener noreferrer"
              className={linkClassName}
              data-mobile-touch-target
            >
              {t('discord')}
            </a>
          </li>
          <li>
            <Link href={paths.privacy} className={linkClassName} data-mobile-touch-target>
              {t('privacy')}
            </Link>
          </li>
          <li>
            <Link href={paths.terms} className={linkClassName} data-mobile-touch-target>
              {t('terms')}
            </Link>
          </li>
        </ul>
      </div>
    </footer>
  )
}
