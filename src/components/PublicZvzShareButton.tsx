'use client'

import { Check, Share2 } from 'lucide-react'
import { useState } from 'react'

export default function PublicZvzShareButton({
  label,
  copiedLabel,
}: {
  label: string
  copiedLabel: string
}) {
  const [copied, setCopied] = useState(false)

  const share = async () => {
    const url = window.location.href
    try {
      if (navigator.share) {
        await navigator.share({ title: document.title, url })
      } else {
        await navigator.clipboard.writeText(url)
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
      className="inline-flex min-h-10 items-center gap-2 rounded-md bg-white/[0.07] px-4 text-sm font-bold text-white shadow-[0_0_0_1px_rgba(255,255,255,0.12)] hover:bg-white/[0.12]"
    >
      {copied ? <Check size={15} /> : <Share2 size={15} />}
      {copied ? copiedLabel : label}
    </button>
  )
}
