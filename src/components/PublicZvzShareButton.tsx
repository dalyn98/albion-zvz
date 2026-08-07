'use client'

import { Check, Share2 } from 'lucide-react'
import { useState } from 'react'

export default function PublicZvzShareButton({
  label,
  copiedLabel,
  url,
  title,
  compact = false,
}: {
  label: string
  copiedLabel: string
  url?: string
  title?: string
  compact?: boolean
}) {
  const [copied, setCopied] = useState(false)

  const share = async () => {
    const shareUrl = url ? new URL(url, window.location.origin).toString() : window.location.href
    try {
      if (navigator.share) {
        await navigator.share({ title: title ?? document.title, url: shareUrl })
      } else {
        await navigator.clipboard.writeText(shareUrl)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1800)
      }
    } catch {
      // A cancelled native share or denied clipboard is intentionally silent.
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      data-seo-event="battle_share"
      aria-label={copied ? copiedLabel : label}
      title={copied ? copiedLabel : label}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-white/[0.07] font-bold text-white shadow-[0_0_0_1px_rgba(255,255,255,0.12)] transition-[background-color,scale] duration-150 ease-out hover:bg-white/[0.12] active:scale-[0.96] ${compact ? 'min-w-10 px-2' : 'px-4 text-sm'}`}
    >
      {copied ? <Check size={15} /> : <Share2 size={15} />}
      {compact ? (
        <span className="sr-only">{copied ? copiedLabel : label}</span>
      ) : copied ? copiedLabel : label}
    </button>
  )
}
