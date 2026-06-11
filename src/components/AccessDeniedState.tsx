import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

interface AccessDeniedStateProps {
  primaryHref?: string
  primaryLabel?: string
  className?: string
}

export default async function AccessDeniedState({
  primaryHref = '/admin/dashboard',
  primaryLabel,
  className = '',
}: AccessDeniedStateProps) {
  const t = await getTranslations('accessDenied')
  const resolvedPrimaryLabel = primaryLabel ?? t('backToDashboard')

  return (
    <section
      className={`rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-10 text-center ${className}`}
      aria-labelledby="access-denied-title"
    >
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-200">
        <ShieldAlert size={24} aria-hidden="true" />
      </div>
      <h1 id="access-denied-title" className="mt-4 text-lg font-semibold text-white">
        {t('title')}
      </h1>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-gray-400">
        {t('description')}
      </p>
      <Link
        href={primaryHref}
        className="mt-5 inline-flex items-center justify-center rounded-md border border-amber-500/40 bg-amber-400 px-3 py-2 text-sm font-semibold text-gray-950 transition-colors hover:bg-amber-300"
      >
        {resolvedPrimaryLabel}
      </Link>
    </section>
  )
}
