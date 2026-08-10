import Link from 'next/link'
import { resolveMarketingHref } from '@/lib/marketing-paths'
import { getMarketingPaths } from '@/lib/marketing-paths-request'
import { getMarketingLocale } from '@/lib/marketing-static-intl'
import { getLocalizedDocsText } from '@/lib/docs-translations'

interface Card {
  href: string
  title: string
  description: string
}

interface Props {
  cards: Card[]
}

export default async function DocCardGrid({ cards }: Props) {
  const [paths, locale] = await Promise.all([getMarketingPaths(), getMarketingLocale()])

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-6">
      {cards.map((card) => {
        const href = resolveMarketingHref(paths, card.href)
        return (
          <Link
            key={card.href}
            href={href}
            className="group block p-4 rounded-lg border border-gray-800 bg-gray-900/40 hover:border-amber-500/50 hover:bg-amber-500/5 transition-colors"
          >
            <div className="text-amber-300 font-bold text-base mb-1 group-hover:text-amber-200">
              {getLocalizedDocsText(locale, card.title)}
            </div>
            <p className="text-gray-400 text-sm leading-relaxed">{getLocalizedDocsText(locale, card.description)}</p>
          </Link>
        )
      })}
    </div>
  )
}
