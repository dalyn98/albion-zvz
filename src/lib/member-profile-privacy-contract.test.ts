import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('member profile privacy contract', () => {
  it('keeps exception directories behind live member-management access', () => {
    const generalPage = source('src/app/(app-shell)/members/page.tsx')
    expect(generalPage).toContain('requireLiveSession')
    expect(generalPage).not.toContain('MembersPageTabs')
    expect(generalPage).not.toContain('listMembersDirectoryTab')

    const operationsPage = source(
      'src/app/(app-shell)/admin/dashboard/members/page.tsx',
    )
    expect(operationsPage).toContain('requireLiveSession')
    expect(operationsPage).toContain('CAP.MEMBERS_MANAGE')
    expect(operationsPage).toContain("visibleTabs={OPERATIONS_TABS}")
    expect(operationsPage).toContain(
      'memberHrefPrefix="/admin/dashboard/members"',
    )

    const withdrawnList = source('src/components/GuildWithdrawnList.tsx')
    expect(withdrawnList).toContain(
      'href={`${memberHrefPrefix}/${member.discord_id}`}',
    )
  })

  it('queries and serializes private member domains only for their capability', () => {
    const detailAction = source('src/app/actions/members-admin-detail.ts')
    expect(detailAction).toMatch(
      /const regearQuery = db[\s\S]*?\.from\('regear_requests'\)[\s\S]*?scopes\.regear\s*\?\s*stableMember\s*\?\s*regearQuery\.eq\('guild_member_id'/,
    )
    expect(detailAction).toMatch(
      /scopes\.finance[\s\S]*?\.from\('exchange_requests'\)/,
    )
    expect(detailAction).toMatch(
      /scopes\.finance[\s\S]*?listMemberPointLedgerEntries/,
    )
    expect(detailAction).toContain('...(scopes.finance')
    expect(detailAction).toContain('...(scopes.regear')
    expect(detailAction).toContain('...(scopes.identityOperations')
  })

  it('requires active state on common detail and allows exceptions only in managed detail', () => {
    const detailAction = source('src/app/actions/members-admin-detail.ts')
    expect(detailAction).toContain('isMemberSubject(discordId)')
    expect(detailAction).toContain('requireLiveSession')
    expect(detailAction).toContain(
      'return fetchMemberDetail(discordId, guildId, scopes)',
    )
    expect(detailAction).toContain(
      'return fetchMemberDetail(discordId, guildId, scopes, { requireActive: false })',
    )
    expect(detailAction).toMatch(
      /getAlbionMemberDetail[\s\S]*isAlbionPlayerId\(albionPlayerId\)[\s\S]*scopes\.memberOperations/,
    )
  })

  it('separates aggregate statistics from personally identifiable review rows', () => {
    const statsAction = source('src/app/actions/stats-admin.ts')
    expect(statsAction).toContain('canViewAggregateStats')
    expect(statsAction).toContain('canManageIdentityReview')
    expect(statsAction).toMatch(
      /pendingMembers:\s*canManageIdentityReview\s*\?/,
    )
    expect(statsAction).toMatch(
      /verifiedMembers:\s*canManageIdentityReview\s*\?/,
    )
  })

  it('publishes member activity only for active tenants without leaking an internal tenant id', () => {
    const detailAction = source('src/app/actions/members-admin-detail.ts')
    expect(detailAction).toContain(
      'tenants!inner(slug, name, status)',
    )
    expect(detailAction).toContain(
      ".eq('tenants.status', 'active')",
    )
    expect(detailAction).toContain(
      'guildName: displayNameFromSlug(slug) || name || null',
    )
    expect(detailAction).not.toContain(
      'guildName: displayNameFromSlug(slug) || name || guildId',
    )
  })
})
