import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getMarketingPaths } from '@/lib/marketing-paths'

export default async function MarketingFooter() {
  const [t, paths] = await Promise.all([
    getTranslations('publicNav'),
    getMarketingPaths(),
  ])
  const year = new Date().getFullYear()

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
            <Link href={paths.home} className="hover:text-white transition-colors">
              {t('home')}
            </Link>
          </li>
          <li>
            <Link href={paths.features} className="hover:text-white transition-colors">
              {t('features')}
            </Link>
          </li>
          <li>
            <Link href={paths.pricing} className="hover:text-white transition-colors">
              {t('pricing')}
            </Link>
          </li>
          <li>
            <Link href={paths.docs} className="hover:text-white transition-colors">
              {t('docs')}
            </Link>
          </li>
          <li>
            <Link href={paths.demo} className="hover:text-white transition-colors">
              {t('demo')}
            </Link>
          </li>
          <li>
            <Link href={paths.faq} className="hover:text-white transition-colors">
              {t('faq')}
            </Link>
          </li>
          <li>
            <a
              href="https://discord.gg/pJ8EsybBjm"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors"
            >
              {t('discord')}
            </a>
          </li>
          <li>
            <Link href={paths.privacy} className="hover:text-white transition-colors">
              {t('privacy')}
            </Link>
          </li>
          <li>
            <Link href={paths.terms} className="hover:text-white transition-colors">
              {t('terms')}
            </Link>
          </li>
        </ul>
      </div>
    </footer>
  )
}
