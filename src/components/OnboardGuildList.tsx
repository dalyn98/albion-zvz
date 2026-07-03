interface OnboardGuild {
  id: string
  name: string
  icon: string | null
}

interface Props {
  guilds: OnboardGuild[]
  installLabel: string
}

// 각 길드 옆의 Install 버튼은 GET 라우트 핸들러로 이동한다.
// (server action + Set-Cookie + 외부 redirect 조합이 Next.js 에서 신뢰할 수 없어
// /api/auth/discord/bot-install 으로 옮겼다.)
export default function OnboardGuildList({ guilds, installLabel }: Props) {
  return (
    <ul className="flex flex-col gap-2">
      {guilds.map((g) => (
        <li
          key={g.id}
          className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            {g.icon ? (
              // Discord CDN 외부 자원 — Next Image 최적화 이점 없음 (이미 64px 고정).
              // eslint-disable-next-line @next/next/no-img-element
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
          <a
            href={`/api/auth/discord/bot-install?guild_id=${encodeURIComponent(g.id)}`}
            className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg bg-[#5865F2] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#4752c4]"
          >
            {installLabel}
          </a>
        </li>
      ))}
    </ul>
  )
}
