import { Fragment, type ReactNode } from 'react'
import { getMarketingLocale } from '@/lib/marketing-static-intl'
import { getLocalizedDocsText } from '@/lib/docs-translations'

export default async function LocalizedMdxText({ children }: { children: ReactNode }) {
  const locale = await getMarketingLocale()
  if (typeof children === 'string') return getLocalizedDocsText(locale, children)
  if (Array.isArray(children)) {
    return children.map((child, index) => (
      typeof child === 'string'
        ? getLocalizedDocsText(locale, child)
        : <Fragment key={index}>{child}</Fragment>
    ))
  }
  return children
}
