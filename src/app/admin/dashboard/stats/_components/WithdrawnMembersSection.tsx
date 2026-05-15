import { UserMinus, Wallet } from 'lucide-react'
import type { TopHolder } from '@/app/actions/stats-admin'
import MemberAvatar from '@/components/MemberAvatar'
import MemberLink from '@/components/MemberLink'
import CollapsibleList from '@/components/CollapsibleList'
import { STATS_COLLAPSED_ROWS, type StatsTranslator } from './shared'

export default function WithdrawnMembersSection({
  withdrawnHeld,
  withdrawnHolders,
  tStats,
}: {
  withdrawnHeld: number
  withdrawnHolders: TopHolder[]
  tStats: StatsTranslator
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <UserMinus size={18} className="text-gray-400" />
        <h2 className="text-lg font-semibold text-white">{tStats('withdrawnTitle')}</h2>
      </div>
      <p className="text-xs text-gray-500">{tStats('withdrawnDescription')}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-gray-800/40 border border-gray-700 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Wallet size={16} className="text-gray-400" />
            <span className="text-xs text-gray-300">{tStats('withdrawnHeldLabel')}</span>
          </div>
          <div className="text-2xl font-bold font-mono text-gray-300">
            {withdrawnHeld.toLocaleString()}
          </div>
          <div className="text-[11px] text-gray-500">{tStats('withdrawnHeldHint')}</div>
        </div>
        <div className="bg-gray-800/40 border border-gray-700 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2">
            <UserMinus size={16} className="text-gray-400" />
            <span className="text-xs text-gray-300">{tStats('withdrawnHoldersLabel')}</span>
          </div>
          <div className="text-2xl font-bold font-mono text-gray-300">
            {withdrawnHolders.length.toLocaleString()}
          </div>
          <div className="text-[11px] text-gray-500">{tStats('withdrawnHoldersHint')}</div>
        </div>
      </div>

      <div className="bg-gray-900/60 border border-gray-700 rounded-lg">
        <header className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">{tStats('withdrawnListTitle')}</h3>
          <span className="text-xs text-gray-500">
            {tStats('membersCount', { count: withdrawnHolders.length.toLocaleString() })}
          </span>
        </header>
        {withdrawnHolders.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            {tStats('withdrawnListEmpty')}
          </div>
        ) : (
          <CollapsibleList
            as="ol"
            className="divide-y divide-gray-800"
            initialCount={STATS_COLLAPSED_ROWS}
            unit="members"
          >
            {withdrawnHolders.map((h, idx) => (
              <li
                key={h.discordId}
                className="flex items-center gap-3 px-4 py-2 hover:bg-gray-800/40"
              >
                <span className="text-xs text-gray-500 font-mono w-6 text-right">{idx + 1}</span>
                <MemberAvatar discordId={h.discordId} avatar={h.avatar} size={24} />
                <span className="flex-1 text-sm text-gray-400 truncate flex items-center gap-2 min-w-0">
                  <MemberLink
                    discordId={h.discordId}
                    username={h.username}
                    className="truncate line-through"
                  />
                  <span className="text-[10px] text-gray-500 border border-gray-700 rounded px-1 py-0.5 flex-shrink-0">
                    WITHDRAWN
                  </span>
                </span>
                <span className="text-sm font-mono text-gray-400 tabular-nums">
                  {h.balance.toLocaleString()}
                </span>
              </li>
            ))}
          </CollapsibleList>
        )}
      </div>
    </section>
  )
}
