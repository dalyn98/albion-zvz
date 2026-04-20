import { getTranslations } from 'next-intl/server'
import { Crown, Swords, Trophy, ShieldAlert } from 'lucide-react'
import type { EventBattle } from '@/types'
import MemberAvatar from './MemberAvatar'

interface Props {
  battles: EventBattle[]
  mvpNames: Record<string, string>
  avatars: Record<string, string | null>
}

export default async function EventBattlesSection({ battles, mvpNames, avatars }: Props) {
  const t = await getTranslations('eventBattles')
  return (
    <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-3">
      <header className="flex items-center gap-2">
        <Swords size={16} className="text-amber-400" />
        <h2 className="text-lg font-bold text-white">{t('title')}</h2>
        <span className="text-xs text-gray-400">
          {t('count', { n: battles.length })}
        </span>
      </header>
      <ul className="divide-y divide-gray-800 border border-gray-800 rounded-lg overflow-hidden">
        {battles.map((b) => {
          const isWin = b.outcome === 'win'
          const mvpName = b.mvp_discord_id
            ? mvpNames[b.mvp_discord_id] ?? b.mvp_discord_id
            : null
          return (
            <li
              key={b.id}
              className="flex items-center gap-3 px-3 py-2 bg-gray-900/40 flex-wrap"
            >
              <span className="text-gray-500 text-xs font-mono w-8 text-center flex-shrink-0">
                #{b.battle_number}
              </span>
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded flex-shrink-0 ${
                  isWin
                    ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40'
                    : 'bg-rose-500/20 text-rose-200 border border-rose-500/40'
                }`}
              >
                {isWin ? <Trophy size={11} /> : <ShieldAlert size={11} />}
                {isWin ? t('win') : t('loss')}
              </span>
              <span className="text-white text-sm font-semibold truncate flex-1 min-w-0">
                {b.opponent_guild}
              </span>
              {mvpName && b.mvp_discord_id && (
                <span className="inline-flex items-center gap-1.5 text-[11px] bg-amber-500/10 border border-amber-500/30 text-amber-200 px-2 py-0.5 rounded-full flex-shrink-0">
                  <Crown size={11} className="text-amber-300" />
                  <MemberAvatar
                    discordId={b.mvp_discord_id}
                    avatar={avatars[b.mvp_discord_id] ?? null}
                    size={16}
                  />
                  <span className="font-semibold">{mvpName}</span>
                  <span className="text-amber-300/80">{t('mvpSuffix')}</span>
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
