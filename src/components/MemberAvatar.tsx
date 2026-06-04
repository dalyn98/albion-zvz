'use client'

import { useState } from 'react'
import { UserCircle2 } from 'lucide-react'
import { discordAvatarUrl } from '@/lib/discord-avatar-url'

interface Props {
  discordId: string | null | undefined
  avatar: string | null | undefined
  size?: number
  className?: string
}

// Small round avatar for member nicknames. Falls back to a UserCircle2 icon
// when we don't have a Discord avatar hash (user never logged in after the
// guild_avatars table was introduced, or they have no custom avatar) OR
// when the Discord CDN returns an error (stale hash after user updated their
// avatar since their last login — common enough to warrant a graceful fallback
// instead of the browser's broken-image placeholder).
export default function MemberAvatar({ discordId, avatar, size = 20, className = '' }: Props) {
  const [broken, setBroken] = useState(false)
  const url = discordId ? discordAvatarUrl(discordId, avatar, Math.max(size, 32)) : null
  if (url && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        onError={() => setBroken(true)}
        className={`rounded-full flex-shrink-0 ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <UserCircle2
      size={size}
      className={`text-gray-500 flex-shrink-0 ${className}`}
    />
  )
}
