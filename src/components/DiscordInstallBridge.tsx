import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import DiscordIcon from '@/components/DiscordIcon'
import InAppBrowserNotice from '@/components/InAppBrowserNotice'
import type { InAppBrowserKind } from '@/lib/user-agent'

interface Props {
  title: string
  description: string
  continueLabel: string
  hint: string
  installUrl: string
  backHref?: string
  backLabel?: string
  errorMessage?: string | null
  inAppBrowserNotice: {
    title: string
    description: string
    copyButtonLabel: string
    copiedLabel: string
    copyFailedLabel: string
    openBrowserLabel: string
    perAppHint: Partial<Record<NonNullable<InAppBrowserKind>, string>>
  }
}

export default function DiscordInstallBridge({
  title,
  description,
  continueLabel,
  hint,
  installUrl,
  backHref,
  backLabel,
  errorMessage,
  inAppBrowserNotice,
}: Props) {
  return (
    <main className="flex-1 w-full max-w-md mx-auto px-4 py-12 sm:py-16">
      <div className="space-y-6">
        <div className="space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#5865F2] text-[#fff]">
            <DiscordIcon />
          </div>
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          <p className="text-sm leading-relaxed text-gray-300">{description}</p>
        </div>

        <InAppBrowserNotice
          title={inAppBrowserNotice.title}
          description={inAppBrowserNotice.description}
          copyButtonLabel={inAppBrowserNotice.copyButtonLabel}
          copiedLabel={inAppBrowserNotice.copiedLabel}
          copyFailedLabel={inAppBrowserNotice.copyFailedLabel}
          openBrowserLabel={inAppBrowserNotice.openBrowserLabel}
          perAppHint={inAppBrowserNotice.perAppHint}
        />

        {errorMessage && (
          <p
            role="alert"
            className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
          >
            {errorMessage}
          </p>
        )}

        <div className="space-y-3">
          <a
            href={installUrl}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#5865F2] px-4 py-3.5 text-sm font-semibold text-[#fff] shadow-[0_10px_30px_-10px_rgba(88,101,242,0.6)] transition-colors hover:bg-[#4752c4]"
          >
            <DiscordIcon />
            <span>{continueLabel}</span>
            <ExternalLink size={15} />
          </a>
          <p className="text-center text-xs leading-relaxed text-gray-400">{hint}</p>
          {backHref && backLabel && (
            <Link
              href={backHref}
              className="inline-flex w-full items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-gray-200 transition-colors hover:bg-white/10"
            >
              {backLabel}
            </Link>
          )}
        </div>
      </div>
    </main>
  )
}
