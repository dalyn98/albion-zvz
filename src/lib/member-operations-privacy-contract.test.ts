import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

const retiredRuntimePaths = [
  'src/app/actions/member-operations.ts',
  'src/components/MemberAbsenceSettings.tsx',
  'src/components/MemberTrialCard.tsx',
  'src/lib/member-operations-server.ts',
  'src/lib/member-operations.ts',
] as const

const operationalSurfaces = [
  'src/app/(app-shell)/admin/dashboard/events/[id]/page.tsx',
  'src/app/(app-shell)/admin/dashboard/members/[discordId]/page.tsx',
  'src/app/(app-shell)/events/[id]/page.tsx',
  'src/app/(app-shell)/me/settings/page.tsx',
  'src/app/(app-shell)/members/[discordId]/page.tsx',
  'src/components/EventEditSaveBar.tsx',
] as const

describe('retired member trial and absence boundary', () => {
  it('removes the unapproved runtime input and decision surfaces', () => {
    for (const path of retiredRuntimePaths) {
      expect(existsSync(join(process.cwd(), path)), path).toBe(false)
    }

    for (const path of operationalSurfaces) {
      const source = read(path)
      expect(source, path).not.toMatch(
        /member-operations|MemberTrialCard|MemberAbsenceSettings|memberAbsence|trialProfile|assignedAbsences|myEventAbsences/,
      )
    }
  })

  it('keeps the shared member directory free of retired state', () => {
    const source = read('src/app/actions/members-admin.ts')
    expect(source).toContain('sessionHas(session, CAP.MEMBERS_MANAGE)')
    expect(source).not.toContain('loadMemberOperationSummaryMap')
    expect(source).not.toContain('trial_status:')
    expect(source).not.toContain('active_absence:')
  })

  it('keeps the shared member directory on stable, verified identities and hides raw Discord ids', () => {
    const membersAction = read('src/app/actions/members-admin.ts')
    const listBody = membersAction.slice(
      membersAction.indexOf('export async function listGuildMembers'),
      membersAction.indexOf('export interface WithdrawnMemberSummary'),
    )
    expect(listBody).toContain(".from('guild_member_directory_v1')")
    expect(listBody).toContain('listMatchingAlbionResourceExceptionDiscordIds')
    expect(listBody).toContain("row.character_trust_status === 'roster_matched'")
    expect(listBody).toContain("row.character_trust_status === 'trusted'")
    expect(listBody).toContain('resourceExceptionDiscordIds.has(row.discord_id)')
    expect(listBody).toContain(".not('assigned_guild_member_id', 'is', null)")
    expect(listBody).toContain('member.discord_updated_at ?? member.joined_at')
    expect(listBody).not.toContain(".from('guests')")
    expect(listBody).not.toContain(".from('albion_guild_members')")

    const detailAction = read('src/app/actions/members-admin-detail.ts')
    expect(detailAction).toContain('requireVerifiedCharacter: session.discordId !== discordId')
    expect(detailAction).toContain("stableMember?.characterTrustStatus !== 'roster_matched'")
    expect(detailAction).toContain("stableMember?.characterTrustStatus !== 'trusted'")

    const memberPage = read('src/app/(app-shell)/members/[discordId]/page.tsx')
    expect(memberPage).toContain('showDiscordId={false}')

    const publicActivityLayout = read('src/app/(public-shell)/public/u/layout.tsx')
    expect(publicActivityLayout).toContain('index: false')
    expect(publicActivityLayout).toContain("referrer: 'no-referrer'")
  })

  it('preserves historical rows while blocking every application write path', () => {
    const sql = read(
      'supabase/migrations/322_retire_unapproved_member_operations.sql',
    )

    expect(sql).toMatch(
      /revoke insert, update, delete[\s\S]*member_trial_profiles[\s\S]*service_role/i,
    )
    expect(sql).toMatch(
      /revoke insert, update, delete[\s\S]*member_absences[\s\S]*service_role/i,
    )
    expect(sql).toMatch(
      /grant select on table public\.member_trial_profiles to service_role/i,
    )
    expect(sql).toMatch(
      /grant select on table public\.member_absences to service_role/i,
    )
    expect(sql).toMatch(
      /revoke all[\s\S]*save_member_trial[\s\S]*service_role/i,
    )
    expect(sql).toMatch(
      /revoke all[\s\S]*create_member_absence[\s\S]*service_role/i,
    )
    expect(sql).not.toMatch(/\b(drop|truncate|delete from)\b/i)
  })
})
