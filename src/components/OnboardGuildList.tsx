'use client'

import { useState, useTransition } from 'react'
import { startBotInstall } from '@/app/actions/onboard'

interface OnboardGuild {
  id: string
  name: string
  icon: string | null
}

interface Props {
  guilds: OnboardGuild[]
  installLabel: string
}

// 각 길드 옆의 Install 버튼을 눌러 Discord 봇 설치 OAuth 로 이동한다. state
// cookie 는 서버 액션이 심고, redirect 로 Discord 로 보낸다.
export default function OnboardGuildList({ guilds, installLabel }: Props) {
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const onInstall = (guildId: string) => {
    setPendingId(guildId)
    startTransition(async () => {
      await startBotInstall(guildId)
    })
  }

  return (
    <ul className="flex flex-col gap-2">
      {guilds.map((g) => (
        <li
          key={g.id}
          className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            {g.icon ? (
              <img
                src={`https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64`}
                alt=""
                className="w-10 h-10 rounded-lg"
              />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-xs font-semibold text-gray-300">
                {g.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white truncate">{g.name}</div>
            </div>
          </div>
          <button
            type="button"
            disabled={isPending && pendingId === g.id}
            onClick={() => onInstall(g.id)}
            className="shrink-0 rounded-lg bg-[#5865F2] hover:bg-[#4752c4] disabled:opacity-60 text-white text-xs font-semibold px-3 py-1.5"
          >
            {installLabel}
          </button>
        </li>
      ))}
    </ul>
  )
}
