import {
  Users,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  UserX,
} from 'lucide-react'
import { DEMO_VERIFICATION_STATS, type DemoVerificationMember } from '@/data/demo-seed'
import CollapsibleList from '@/components/CollapsibleList'
import { ALBION_SERVER_LABEL_KEY } from '@/lib/albion-gameinfo'
import {
  DemoStatCard,
  MockAvatar,
  STATS_COLLAPSED_ROWS,
  type StatsTranslator,
  type CommonTranslator,
} from './shared'

export default function AlbionVerificationSection({
  tStats,
  tCommon,
}: {
  tStats: StatsTranslator
  tCommon: CommonTranslator
}) {
  const stats = DEMO_VERIFICATION_STATS

  const cards = [
    {
      label: tStats('verificationActiveLabel'),
      value: stats.totalActive,
      hint: tStats('verificationActiveHint'),
      icon: Users,
      tone: 'neutral' as const,
    },
    {
      label: tStats('verificationVerifiedLabel'),
      value: stats.verified,
      hint: tStats('verificationVerifiedHint'),
      icon: ShieldCheck,
      tone: 'success' as const,
    },
    {
      label: tStats('verificationUnverifiedLabel'),
      value: stats.unverified,
      hint: tStats('verificationUnverifiedHint'),
      icon: ShieldAlert,
      tone: stats.unverified > 0 ? ('warning' as const) : ('neutral' as const),
    },
    {
      label: tStats('verificationOnboardingPendingLabel'),
      value: stats.onboardingPending,
      hint: tStats('verificationOnboardingPendingHint'),
      icon: ShieldQuestion,
      tone: stats.onboardingPending > 0 ? ('danger' as const) : ('neutral' as const),
    },
  ]

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck size={18} className="text-emerald-300" />
        <h2 className="text-lg font-semibold text-white">{tStats('verificationTitle')}</h2>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed">{tStats('verificationDescription')}</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((card) => {
          return (
            <DemoStatCard
              key={card.label}
              icon={card.icon}
              label={card.label}
              value={card.value}
              hint={card.hint}
              tone={card.tone}
            />
          )
        })}
      </div>

      <VerificationMemberList
        title={tStats('pendingMembersTitle')}
        icon={UserX}
        accent="text-rose-300"
        emptyLabel={tStats('pendingMembersEmpty')}
        members={stats.pendingMembers}
        mode="pending"
        tStats={tStats}
        tCommon={tCommon}
      />
      <VerificationMemberList
        title={tStats('unverifiedMembersTitle')}
        icon={ShieldAlert}
        accent="text-yellow-300"
        emptyLabel={tStats('unverifiedMembersEmpty')}
        members={stats.unverifiedMembers}
        mode="unverified"
        tStats={tStats}
        tCommon={tCommon}
      />
      <VerificationMemberList
        title={tStats('verifiedMembersTitle')}
        icon={ShieldCheck}
        accent="text-emerald-300"
        emptyLabel={tStats('verifiedMembersEmpty')}
        members={stats.verifiedMembers}
        mode="verified"
        tStats={tStats}
        tCommon={tCommon}
      />
    </section>
  )
}

function VerificationMemberList({
  title,
  icon: Icon,
  accent,
  emptyLabel,
  members,
  mode,
  tStats,
  tCommon,
}: {
  title: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  accent: string
  emptyLabel: string
  members: DemoVerificationMember[]
  mode: 'pending' | 'unverified' | 'verified'
  tStats: StatsTranslator
  tCommon: CommonTranslator
}) {
  return (
    <div className="bg-gray-900/60 border border-gray-700 rounded-lg">
      <header className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Icon size={14} className={accent} />
          {title}
        </h3>
        <span className="text-xs text-gray-500">
          {tStats('membersCount', { count: members.length.toLocaleString() })}
        </span>
      </header>
      {members.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-gray-500">{emptyLabel}</div>
      ) : (
        <CollapsibleList
          as="ul"
          className="divide-y divide-gray-800"
          initialCount={STATS_COLLAPSED_ROWS}
          unit="members"
        >
          {members.map((m) => (
            <li
              key={m.discordId}
              className="flex items-center gap-3 px-4 py-2 hover:bg-gray-800/40"
            >
              <MockAvatar size={24} />
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <span className="text-sm text-gray-200 truncate">{m.ign}</span>
                {m.isAdmin && (
                  <span className="text-[10px] text-amber-400 border border-amber-500/40 rounded px-1 py-0.5 flex-shrink-0">
                    ADMIN
                  </span>
                )}
              </div>
              {(mode === 'unverified' || mode === 'verified') && (
                <div className="hidden sm:flex flex-col items-end text-[11px] text-gray-500 min-w-0">
                  <span className="text-gray-300 truncate max-w-[140px]">{m.nickname ?? '—'}</span>
                  <span className="font-mono">
                    {m.server ? tCommon(ALBION_SERVER_LABEL_KEY[m.server]) : '—'}
                    {m.guildId ? (
                      m.guildMatchesHome ? (
                        <span className="ml-1 text-emerald-400">
                          · {tStats('verificationGuildMatch')}
                        </span>
                      ) : (
                        <span className="ml-1 text-rose-400">
                          · {tStats('verificationGuildMismatch')}
                        </span>
                      )
                    ) : (
                      <span className="ml-1 text-gray-600">
                        · {tStats('verificationManualInput')}
                      </span>
                    )}
                  </span>
                </div>
              )}
            </li>
          ))}
        </CollapsibleList>
      )}
    </div>
  )
}
