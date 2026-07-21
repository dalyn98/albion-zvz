'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Crown, Users, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import SearchBox from './SearchBox'
import MemberAvatar from './MemberAvatar'
import LanguageBadge from './LanguageBadge'
import { matchesName, normalizeQuery } from '@/lib/search-match'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import { SLOT_ROLES, getRoleStyle, type SlotRole } from '@/types'
import type { GuildMemberSummary } from '@/app/actions/members-admin'
import {
  useItemNameResolver,
  type ItemNameResolver,
} from '@/lib/item-names-client'
import { canonicalT8WeaponId } from '@/lib/weapon-display'
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n/locales'
import { compareIsoStringsDesc, compareStrings } from '@/lib/sort-strings'
import AlbionItemImage from './AlbionItemImage'

// 무기군 필터/뱃지에 쓸 라벨. 킬보드 샘플(T6_... 등) 을 그대로 로컬라이즈하면
// "마스터의 ~" 같이 티어별로 쪼개져 보여서, 같은 무기군을 T8.0 canonical 로
// 정규화해 "장로의 할로우폴" 한 가지 표기로 통일. canonical 로 번역이 안 나오면
// 원본 sample 로 폴백, 그마저도 없으면 category 코드.
function resolveWeaponLabel(
  sampleId: string | null,
  locale: Locale,
  unknownLabel: string,
  getLocalizedItemName: ItemNameResolver,
): string {
  if (!sampleId) return unknownLabel
  const canonicalId = canonicalT8WeaponId(sampleId) ?? sampleId
  const name =
    getLocalizedItemName(canonicalId, locale, null) ??
    getLocalizedItemName(sampleId, locale, null)
  return name ?? unknownLabel
}

// 필터 뱃지 아이콘도 이름과 동일한 canonical id 로 렌더해야 T6 인챈트 아이콘이
// 섞이지 않는다. null 이면 render API 에 넘길 수 있도록 원본 id 로 폴백.
function resolveWeaponIconId(sampleId: string | null): string | null {
  if (!sampleId) return null
  return canonicalT8WeaponId(sampleId) ?? sampleId
}

interface Props {
  members: GuildMemberSummary[]
  memberHrefPrefix?: string
}

type SortKey = 'participation' | 'recent'
const BADGE_LIMIT = 3
// 무기군 개수가 이 값을 넘으면 chip 대신 드롭다운으로 렌더. flex-wrap 이
// 여러 줄로 늘어지면 UI 혼잡해져서 컨벤션(드롭다운/플랫)에 맞춰 전환.
const WEAPON_DROPDOWN_THRESHOLD = 8

export default function GuildMemberList({ members, memberHrefPrefix = '/members' }: Props) {
  const t = useTranslations('members')
  const tRole = useTranslations('slotRole')
  const rawLocale = useLocale()
  const locale: Locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE
  const { getLocalizedItemName } = useItemNameResolver(locale)
  const unknownWeaponLabel = t('weaponUnknown')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('participation')
  const [roleFilter, setRoleFilter] = useState<SlotRole | null>(null)
  const [weaponFilter, setWeaponFilter] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = normalizeQuery(search)
    let base = q ? members.filter((m) => matchesName(m.username, q)) : members
    if (roleFilter) {
      base = base.filter((m) =>
        m.top_roles.some((r) => r.role === roleFilter && r.count > 0),
      )
    }
    if (weaponFilter) {
      base = base.filter((m) =>
        m.top_weapons.some((w) => w.category === weaponFilter && w.count > 0),
      )
    }
    const sorted = [...base]
    // Filter-aware sort: whichever active filter is "strongest" drives the
    // order so matches with higher usage of the filtered role/weapon come
    // first. Fall through on ties to keep the order deterministic.
    if (weaponFilter) {
      sorted.sort((a, b) => {
        const countA = a.top_weapons.find((w) => w.category === weaponFilter)?.count ?? 0
        const countB = b.top_weapons.find((w) => w.category === weaponFilter)?.count ?? 0
        if (countB !== countA) return countB - countA
        if (roleFilter) {
          const rA = a.top_roles.find((r) => r.role === roleFilter)?.count ?? 0
          const rB = b.top_roles.find((r) => r.role === roleFilter)?.count ?? 0
          if (rB !== rA) return rB - rA
        }
        if (b.participation_count !== a.participation_count) {
          return b.participation_count - a.participation_count
        }
        return compareStrings(a.username, b.username)
      })
    } else if (roleFilter) {
      sorted.sort((a, b) => {
        const countA = a.top_roles.find((r) => r.role === roleFilter)?.count ?? 0
        const countB = b.top_roles.find((r) => r.role === roleFilter)?.count ?? 0
        if (countB !== countA) return countB - countA
        if (b.participation_count !== a.participation_count) {
          return b.participation_count - a.participation_count
        }
        return compareStrings(a.username, b.username)
      })
    } else if (sortKey === 'recent') {
      sorted.sort((a, b) => compareIsoStringsDesc(a.updated_at, b.updated_at))
    } else {
      sorted.sort((a, b) => {
        if (b.participation_count !== a.participation_count) {
          return b.participation_count - a.participation_count
        }
        return compareStrings(a.username, b.username)
      })
    }
    return sorted
  }, [members, search, sortKey, roleFilter, weaponFilter])

  const totalParticipations = useMemo(
    () => members.reduce((acc, m) => acc + m.participation_count, 0),
    [members],
  )

  // Only show role chips that actually have any member participating — avoids
  // a row of dead chips for roles no one has played yet.
  const availableRoles = useMemo(() => {
    const seen = new Set<string>()
    for (const m of members) {
      for (const r of m.top_roles) {
        if (r.count > 0) seen.add(r.role)
      }
    }
    return SLOT_ROLES.filter((r) => seen.has(r))
  }, [members])

  // Aggregate guild-wide weapon usage so the filter shows the most-used
  // categories first (and members picking rare weapons don't hide them).
  const availableWeapons = useMemo(() => {
    const tally = new Map<string, { count: number; sampleId: string | null }>()
    for (const m of members) {
      for (const w of m.top_weapons) {
        if (w.count <= 0) continue
        const existing = tally.get(w.category)
        if (existing) {
          existing.count += w.count
          if (!existing.sampleId && w.sample_weapon_id) existing.sampleId = w.sample_weapon_id
        } else {
          tally.set(w.category, { count: w.count, sampleId: w.sample_weapon_id })
        }
      }
    }
    return Array.from(tally.entries())
      .map(([category, v]) => ({ category, count: v.count, sampleId: v.sampleId }))
      .sort((a, b) => b.count - a.count)
  }, [members])

  const hasFilter = !!roleFilter || !!weaponFilter

  // 활성화된 무기 필터의 로컬라이즈된 라벨. availableWeapons 에 이미 sampleId 가
  // 쌓여 있어서 따로 조회 없이 한 줄로 뽑힌다.
  const activeWeaponLabel = useMemo(() => {
    if (!weaponFilter) return null
    const entry = availableWeapons.find((w) => w.category === weaponFilter)
    return resolveWeaponLabel(
      entry?.sampleId ?? null,
      locale,
      unknownWeaponLabel,
      getLocalizedItemName,
    )
  }, [weaponFilter, availableWeapons, locale, unknownWeaponLabel, getLocalizedItemName])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
        <Users size={18} className="text-amber-400" />
        <div className="text-xs text-gray-400">
          {t.rich('counter', {
            memberCount: members.length,
            total: totalParticipations,
            bold: (chunks) => <span className="text-white font-semibold">{chunks}</span>,
          })}
        </div>
      </div>

      <SearchBox value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />

      {availableRoles.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-gray-500 text-[11px] font-semibold uppercase tracking-wider">
              {t('filterByRole')}
            </span>
            {roleFilter && (
              <button
                type="button"
                onClick={() => setRoleFilter(null)}
                className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-white"
              >
                <X size={11} />
                {t('filterClear')}
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {availableRoles.map((role) => {
              const style = getRoleStyle(role)
              const active = roleFilter === role
              return (
                <button
                  key={role}
                  type="button"
                  onClick={() => setRoleFilter(active ? null : role)}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                    active
                      ? style?.badge ?? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                      : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
                  }`}
                >
                  {translateSlotRole(role, tRole)}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {availableWeapons.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-gray-500 text-[11px] font-semibold uppercase tracking-wider">
              {t('filterByWeapon')}
            </span>
            {weaponFilter && (
              <button
                type="button"
                onClick={() => setWeaponFilter(null)}
                className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-white"
              >
                <X size={11} />
                {t('filterClear')}
              </button>
            )}
          </div>
          {availableWeapons.length > WEAPON_DROPDOWN_THRESHOLD ? (
            <WeaponDropdown
              weapons={availableWeapons}
              value={weaponFilter}
              onChange={setWeaponFilter}
              locale={locale}
              allLabel={t('filterAllWeapons')}
              unknownLabel={unknownWeaponLabel}
            />
          ) : (
            <div className="flex items-center gap-1.5 flex-wrap">
              {availableWeapons.map(({ category, sampleId }) => {
                const active = weaponFilter === category
                const label = resolveWeaponLabel(
                  sampleId,
                  locale,
                  unknownWeaponLabel,
                  getLocalizedItemName,
                )
                const iconId = resolveWeaponIconId(sampleId)
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setWeaponFilter(active ? null : category)}
                    className={`inline-flex items-center gap-1.5 text-[11px] font-semibold pl-1 pr-2.5 py-0.5 rounded-full border transition-colors ${
                      active
                        ? 'bg-amber-500/20 border-amber-500/60 text-amber-200'
                        : 'bg-gray-900 border-gray-700 text-gray-300 hover:text-white hover:border-gray-600'
                    }`}
                  >
                    {iconId ? (
                      <AlbionItemImage
                        src={`https://render.albiononline.com/v1/item/${iconId}.png`}
                        alt=""
                        width={20}
                        height={20}
                        className="rounded-sm bg-black/40 pixel-img"
                      />
                    ) : null}
                    <span>{label}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <SortChip
          active={!hasFilter && sortKey === 'participation'}
          disabled={hasFilter}
          onClick={() => setSortKey('participation')}
        >
          {t('sortByParticipation')}
        </SortChip>
        <SortChip
          active={!hasFilter && sortKey === 'recent'}
          disabled={hasFilter}
          onClick={() => setSortKey('recent')}
        >
          {t('sortByRecent')}
        </SortChip>
        {weaponFilter && activeWeaponLabel && (
          <span className="text-[11px] text-amber-300/80">
            {t('sortByWeaponActive', { weapon: activeWeaponLabel })}
          </span>
        )}
        {roleFilter && !weaponFilter && (
          <span className="text-[11px] text-amber-300/80">
            {t('sortByRoleActive', { role: translateSlotRole(roleFilter, tRole) })}
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-6">{t('noSearchResult')}</p>
      ) : (
        <ul className="space-y-2 xl:grid xl:grid-cols-2 xl:gap-2 xl:space-y-0 2xl:grid-cols-3">
          {filtered.map((m) => (
            <MemberRow
              key={m.discord_id}
              member={m}
              roleFilter={roleFilter}
              weaponFilter={weaponFilter}
              locale={locale}
              unknownWeaponLabel={unknownWeaponLabel}
              memberHrefPrefix={memberHrefPrefix}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function WeaponDropdown({
  weapons,
  value,
  onChange,
  locale,
  allLabel,
  unknownLabel,
}: {
  weapons: Array<{ category: string; count: number; sampleId: string | null }>
  value: string | null
  onChange: (v: string | null) => void
  locale: Locale
  allLabel: string
  unknownLabel: string
}) {
  const { getLocalizedItemName } = useItemNameResolver(locale)
  const selected = value ? weapons.find((w) => w.category === value) ?? null : null
  const selectedIconId = resolveWeaponIconId(selected?.sampleId ?? null)
  return (
    <div className="flex items-center gap-2">
      {selectedIconId ? (
        <AlbionItemImage
          src={`https://render.albiononline.com/v1/item/${selectedIconId}.png`}
          alt=""
          width={24}
          height={24}
          className="rounded-sm bg-black/40 pixel-img flex-shrink-0"
        />
      ) : null}
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value ? e.target.value : null)}
        className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-amber-500"
      >
        <option value="">{allLabel}</option>
        {weapons.map(({ category, count, sampleId }) => (
          <option key={category} value={category}>
            {resolveWeaponLabel(sampleId, locale, unknownLabel, getLocalizedItemName)} ({count})
          </option>
        ))}
      </select>
    </div>
  )
}

function SortChip({
  active,
  onClick,
  children,
  disabled,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
        active
          ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
          : disabled
            ? 'bg-gray-900/50 border-gray-800 text-gray-600 cursor-not-allowed'
            : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

function MemberRow({
  member,
  roleFilter,
  weaponFilter,
  locale,
  unknownWeaponLabel,
  memberHrefPrefix,
}: {
  member: GuildMemberSummary
  roleFilter: SlotRole | null
  weaponFilter: string | null
  locale: Locale
  unknownWeaponLabel: string
  memberHrefPrefix: string
}) {
  const t = useTranslations('members')
  const tRole = useTranslations('slotRole')
  const { getLocalizedItemName } = useItemNameResolver(locale)
  // When a role filter is active, surface that role's badge first even if it's
  // outside the member's top N — so the user can see exactly what matched.
  const badges = useMemo(() => {
    if (!roleFilter) return member.top_roles.slice(0, BADGE_LIMIT)
    const match = member.top_roles.find((r) => r.role === roleFilter)
    if (!match) return member.top_roles.slice(0, BADGE_LIMIT)
    const rest = member.top_roles.filter((r) => r.role !== roleFilter).slice(0, BADGE_LIMIT - 1)
    return [match, ...rest]
  }, [member.top_roles, roleFilter])

  const matchedWeapon = useMemo(() => {
    if (!weaponFilter) return null
    return member.top_weapons.find((w) => w.category === weaponFilter) ?? null
  }, [member.top_weapons, weaponFilter])

  return (
    <li style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 78px' }}>
      <Link
        href={`${memberHrefPrefix}/${member.discord_id}`}
        className="flex items-center gap-3 bg-gray-900 border border-gray-800 hover:border-amber-500/40 rounded-lg px-4 py-3 transition-colors"
      >
        <MemberAvatar discordId={member.discord_id} avatar={member.avatar} size={36} />
        <div className="min-w-0 flex-1">
          <div className="text-white text-sm font-semibold flex items-center gap-1.5 min-w-0">
            {member.is_admin && (
              <Crown
                size={13}
                className="text-amber-300 flex-shrink-0"
                aria-label={t('adminLabel')}
              />
            )}
            <span className="truncate min-w-0">{member.username}</span>
            <LanguageBadge locale={member.preferred_language} />
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {badges.length === 0 ? (
              <span className="text-gray-500 text-[11px]">{t('noParticipationHistory')}</span>
            ) : (
              badges.map((r) => {
                const style = getRoleStyle(r.role)
                const isMatched = roleFilter === r.role
                return (
                  <span
                    key={r.role}
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                      style?.badge ?? 'bg-gray-700 text-gray-300'
                    } ${isMatched ? 'ring-1 ring-amber-300/60' : ''}`}
                  >
                    {translateSlotRole(r.role, tRole)} {r.count}
                  </span>
                )
              })
            )}
            {matchedWeapon && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-200 ring-1 ring-amber-300/60">
                {(() => {
                  const iconId = resolveWeaponIconId(matchedWeapon.sample_weapon_id ?? null)
                  return iconId ? (
                    <AlbionItemImage
                      src={`https://render.albiononline.com/v1/item/${iconId}.png`}
                      alt=""
                      width={14}
                      height={14}
                      className="pixel-img"
                    />
                  ) : null
                })()}
                {resolveWeaponLabel(
                  matchedWeapon.sample_weapon_id ?? null,
                  locale,
                  unknownWeaponLabel,
                  getLocalizedItemName,
                )}{' '}
                {matchedWeapon.count}
              </span>
            )}
          </div>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="text-amber-400 font-mono font-semibold text-sm">{member.participation_count}</p>
          <p className="text-gray-500 text-[10px]">{t('participation')}</p>
        </div>
        <ChevronRight size={16} className="text-gray-600 flex-shrink-0" />
      </Link>
    </li>
  )
}
