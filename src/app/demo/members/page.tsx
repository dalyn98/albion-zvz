import { getTranslations } from 'next-intl/server'
import { DEMO_MEMBERS } from '@/data/demo-seed'
import MembersPageTabs from '@/components/MembersPageTabs'
import DemoGuidedTour from '../_components/DemoGuidedTour'
import DemoCTACard from '../_components/DemoCTACard'
import { DEFAULT_TENANT_TIMEZONE } from '@/lib/timezone'
import type {
  AlbionRosterEntry,
  GuildGuestSummary,
  GuildMemberSummary,
  WithdrawnMemberSummary,
} from '@/app/actions/members-admin'
import type { DemoMember, DemoWeaponKey } from '@/data/demo-seed'

const MEMBERS_TOUR_STEPS = [
  { id: 'members-header' },
  { id: 'members-tabs' },
] as const

const DAY_MS = 24 * 60 * 60 * 1000

const WEAPON_META: Record<DemoWeaponKey, { category: string; sampleId: string; role: string }> = {
  mace: { category: 'MACE', sampleId: 'T8_2H_MACE', role: 'DefTanker' },
  fire: { category: 'FIRESTAFF', sampleId: 'T8_2H_FIRESTAFF', role: 'Dps' },
  lifestaff: { category: 'HOLYSTAFF', sampleId: 'T8_MAIN_HOLYSTAFF', role: 'Healer' },
  dagger: { category: 'DAGGER', sampleId: 'T8_2H_DAGGERPAIR', role: 'Dps' },
  crossbow: { category: 'CROSSBOW', sampleId: 'T8_2H_CROSSBOWLARGE', role: 'Dps' },
}

function daysAgoIso(days: number, nowMs: number): string {
  return new Date(nowMs - days * DAY_MS).toISOString()
}

function getDemoNowMs(): number {
  return Date.now()
}

function toMemberSummary(member: DemoMember, nowMs: number): GuildMemberSummary {
  const primary = WEAPON_META[member.primaryWeapon]
  const secondaryRole = member.role === 'caller' ? 'Caller' : member.role === 'admin' ? 'Caller' : 'Sup'
  return {
    discord_id: member.ign,
    username: member.ign,
    avatar: null,
    is_admin: member.role === 'admin',
    updated_at: daysAgoIso(Math.max(1, Math.floor(member.joinedDaysAgo / 20)), nowMs),
    participation_count: member.battles,
    top_roles: [
      { role: primary.role, count: Math.max(1, Math.round(member.battles * 0.62)) },
      { role: secondaryRole, count: Math.max(1, Math.round(member.battles * 0.22)) },
    ],
    top_weapons: [
      {
        category: primary.category,
        count: Math.max(1, Math.round(member.battles * 0.72)),
        sample_weapon_id: primary.sampleId,
      },
    ],
    preferred_language: 'ko',
  }
}

function toRosterEntry(member: DemoMember, nowMs: number): AlbionRosterEntry {
  return {
    albion_player_id: member.ign,
    albion_player_name: member.ign,
    albion_server: 'west',
    kill_fame: member.kills * 320_000,
    death_fame: member.deaths * 210_000,
    fame_ratio: member.deaths > 0 ? member.kills / member.deaths : member.kills,
    average_item_power: 1420 + member.survivalPct,
    avatar: null,
    avatar_ring: null,
    last_seen_at: daysAgoIso(Math.max(1, Math.floor(member.joinedDaysAgo / 30)), nowMs),
    linked_discord_id: member.ign,
    linked_username: member.ign,
    linked_avatar: null,
    linked_withdrawn: false,
  }
}

function buildDemoMembersData(nowMs: number): {
  members: GuildMemberSummary[]
  guests: GuildGuestSummary[]
  withdrawnMembers: WithdrawnMemberSummary[]
  roster: AlbionRosterEntry[]
} {
  const members = DEMO_MEMBERS.map((member) => toMemberSummary(member, nowMs))
  const roster: AlbionRosterEntry[] = [
    ...DEMO_MEMBERS.map((member) => toRosterEntry(member, nowMs)),
    {
      albion_player_id: 'RivenScout',
      albion_player_name: 'RivenScout',
      albion_server: 'west',
      kill_fame: 6_240_000,
      death_fame: 1_820_000,
      fame_ratio: 3.43,
      average_item_power: 1465,
      avatar: null,
      avatar_ring: null,
      last_seen_at: daysAgoIso(2, nowMs),
      linked_discord_id: null,
      linked_username: null,
      linked_avatar: null,
      linked_withdrawn: false,
    },
  ]
  const guests: GuildGuestSummary[] = [
    {
      discord_id: 'guest-wanderer',
      username: 'Wanderer',
      avatar: null,
      joined_at: daysAgoIso(3, nowMs),
      participation_count: 2,
      top_roles: [{ role: 'Dps', count: 2 }],
      preferred_language: 'ko',
    },
  ]
  const withdrawnMembers: WithdrawnMemberSummary[] = [
    {
      discord_id: 'withdrawn-oldknight',
      username: 'OldKnight',
      avatar: null,
      withdrawn_at: daysAgoIso(14, nowMs),
      updated_at: daysAgoIso(14, nowMs),
      participation_count: 46,
      top_roles: [{ role: 'OffTanker', count: 31 }],
      preferred_language: 'ko',
    },
  ]
  return { members, guests, withdrawnMembers, roster }
}

export default async function DemoMembersPage() {
  const [t, tDemo, tCta] = await Promise.all([
    getTranslations('members'),
    getTranslations('demo'),
    getTranslations('demo.ctaCard'),
  ])
  const { members, guests, withdrawnMembers, roster } = buildDemoMembersData(getDemoNowMs())
  const totalParticipation = members.reduce((sum, m) => sum + m.participation_count, 0)

  return (
    <div className="space-y-6">
      <DemoGuidedTour steps={MEMBERS_TOUR_STEPS} namespace="members" />
      <div
        data-tour-id="members-header"
        className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"
      >
        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-bold text-white">{t('title')}</h1>
          <p className="text-gray-400 text-sm">{t('description')}</p>
        </div>
        <p className="text-xs text-gray-400">
          {t.rich('counter', {
            memberCount: members.length,
            total: totalParticipation,
            bold: (chunks) => <span className="text-white font-semibold">{chunks}</span>,
          })}
        </p>
      </div>

      <div data-tour-id="members-tabs">
        <MembersPageTabs
          members={members}
          guests={guests}
          withdrawnMembers={withdrawnMembers}
          roster={roster}
          isAdmin={false}
          timezone={DEFAULT_TENANT_TIMEZONE}
          memberHrefPrefix="/demo/members"
          albionMemberHrefPrefix={null}
        />
      </div>

      <p className="text-[11px] text-gray-600 italic px-1">{tDemo('members.demoOnlyDetail')}</p>

      <DemoCTACard
        eyebrow={tCta('eyebrow')}
        title={tCta('members.title')}
        description={tCta('members.description')}
        buttonLabel={tCta('buttonLabel')}
      />
    </div>
  )
}
