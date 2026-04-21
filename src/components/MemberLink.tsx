'use client'

import Link from 'next/link'

interface Props {
  discordId: string | null | undefined
  username: string
  className?: string
  // 부모가 hover 색을 강제하고 싶을 때 underline/hover 효과를 끌 수 있게.
  plain?: boolean
  title?: string
}

// 길드원 닉네임 → /members/[discordId] 링크 래퍼.
// discord_id 가 없는 경우(탈퇴 멤버, 게스트 등) 는 링크 없이 span 으로만 렌더.
// 감싸는 쪽이 이미 <Link> 안에 있으면 중첩 링크가 되므로 사용 금지 — 부모가
// 이미 멤버 상세로 가는 링크라면 MemberLink 를 쓰지 말고 그냥 username 텍스트를 두세요.
export default function MemberLink({
  discordId,
  username,
  className = '',
  plain = false,
  title,
}: Props) {
  if (!discordId) {
    return <span className={className}>{username}</span>
  }
  const hoverCls = plain ? '' : 'hover:text-amber-300 hover:underline'
  return (
    <Link
      href={`/members/${discordId}`}
      className={`${hoverCls} ${className}`.trim()}
      title={title ?? username}
      onClick={(e) => e.stopPropagation()}
    >
      {username}
    </Link>
  )
}
