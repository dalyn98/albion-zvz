import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('member operations privacy boundary', () => {
  it('keeps operational state out of the shared active-member list', () => {
    const source = read('src/app/actions/members-admin.ts')
    expect(source).toContain('sessionHas(session, CAP.MEMBERS_MANAGE)')
    expect(source).not.toContain('loadMemberOperationSummaryMap')
    expect(source).not.toContain('trial_status:')
    expect(source).not.toContain('active_absence:')

    const generalPage = read('src/app/(app-shell)/members/page.tsx')
    expect(generalPage).not.toContain('MembersPageTabs')
    expect(generalPage).not.toContain('listMembersDirectoryTab')

    const operationsPage = read(
      'src/app/(app-shell)/admin/dashboard/members/page.tsx',
    )
    expect(operationsPage).toContain('MembersPageTabs')
    expect(operationsPage).toContain('CAP.MEMBERS_MANAGE')
  })

  it('loads a member detail trial and absences only for managers or the member', () => {
    const source = read('src/app/(app-shell)/members/[discordId]/page.tsx')
    expect(source).toContain('resolveMemberDetailScopes')
    expect(source).toContain('canViewMemberOperations')
    expect(source).toContain('scopes.memberOperations')
    expect(source).toMatch(
      /canViewMemberOperations[\s\S]*loadMemberTrialProfile/,
    )
    expect(source).toMatch(
      /canViewMemberOperations[\s\S]*loadMemberAbsences/,
    )
    expect(source).toContain('visibleTrialProfile')
    expect(source).toContain("notes: ''")
    expect(source).toContain("updatedBy: ''")

    const cardSource = read('src/components/MemberTrialCard.tsx')
    expect(cardSource).toContain('canManage && profile.notes')
  })

  it('validates caller-controlled Discord and absence identifiers', () => {
    const source = read('src/app/actions/member-operations.ts')
    expect(source).toContain('isDiscordId(value)')
    expect(source).toContain('isLocalAccountSubject(value)')
    expect(source).toContain('isMemberSubject(input.discordId)')
    expect(source).toContain('isUuid(absenceId)')
    expect(source).toContain("db.rpc('save_member_trial'")
    expect(source).toContain("message.includes('ABSENCE_RANGE')")
  })

  it('paginates operation summaries with a stable member/date/id order', () => {
    const source = read('src/lib/member-operations-server.ts')
    expect(source).toContain('selectPagedRowsOrThrow<MemberAbsenceRow>')
    expect(source).toContain(".order('discord_id', { ascending: true })")
    expect(source).toContain(".order('starts_on', { ascending: true })")
    expect(source).toContain(".order('id', { ascending: true })")
  })

  it('restores the persisted trial draft when editing is cancelled', () => {
    const source = read('src/components/MemberTrialCard.tsx')
    expect(source).toContain('function resetDraft()')
    expect(source).toContain('onClick={cancelEditing}')
  })
})
