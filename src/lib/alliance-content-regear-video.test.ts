import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  appendAllianceContentRegearLinkInput,
  inferAllianceContentRegearSessionId,
  parseAllianceContentRegearLinkInput,
} from './alliance-content-regear-video'

const REQUIREMENT_ID = '11111111-1111-4111-8111-111111111111'
const SESSION_ID = '22222222-2222-4222-8222-222222222222'

describe('alliance content regear video selection', () => {
  const sessions = [
    { id: SESSION_ID, albionBattleIds: [1001, 1002] },
    { id: '33333333-3333-4333-8333-333333333333', albionBattleIds: [2001] },
    { id: '44444444-4444-4444-8444-444444444444', albionBattleIds: [] },
  ]

  it('auto-selects only one eligible session matched by the regear battle', () => {
    expect(inferAllianceContentRegearSessionId(sessions, [2001])).toBe(sessions[1].id)
    expect(inferAllianceContentRegearSessionId(sessions, [1001, 2001])).toBeNull()
    expect(inferAllianceContentRegearSessionId(sessions, [9999])).toBeNull()
  })

  it('accepts the opt-in only with tenant-scoped UUID identifiers', () => {
    const formData = new FormData()
    formData.set('allianceContentUseVideo', 'true')
    formData.set('allianceContentRequirementId', REQUIREMENT_ID)
    formData.set('allianceContentSessionId', SESSION_ID)

    expect(parseAllianceContentRegearLinkInput(formData)).toEqual({
      requirementId: REQUIREMENT_ID,
      sessionId: SESSION_ID,
    })

    formData.set('allianceContentSessionId', 'not-a-uuid')
    expect(parseAllianceContentRegearLinkInput(formData)).toBeNull()
    formData.set('allianceContentUseVideo', 'false')
    expect(parseAllianceContentRegearLinkInput(formData)).toBeNull()
  })

  it('adds the bridge fields only when the member opted in with a valid session', () => {
    const formData = new FormData()
    const option = {
      requirementId: REQUIREMENT_ID,
      dueAt: '2026-07-20T11:00:00.000Z',
      sessions: [],
    }

    appendAllianceContentRegearLinkInput(formData, option, SESSION_ID, true)
    expect(parseAllianceContentRegearLinkInput(formData)).toEqual({
      requirementId: REQUIREMENT_ID,
      sessionId: SESSION_ID,
    })

    const disabled = new FormData()
    appendAllianceContentRegearLinkInput(disabled, option, SESSION_ID, false)
    expect(parseAllianceContentRegearLinkInput(disabled)).toBeNull()
  })
})

describe('alliance content regear video migration', () => {
  it('stores a tenant-safe regear source and exposes a service-role-only bridge RPC', () => {
    const sql = [
      '260_alliance_content_regear_video_source.sql',
      '261_alliance_content_regear_video.sql',
    ].map((fileName) => readFileSync(
      join(process.cwd(), 'supabase', 'migrations', fileName),
      'utf8',
    )).join('\n').toLowerCase()

    expect(sql).toContain('submission_source')
    expect(sql).toContain('source_regear_request_id')
    expect(sql).toContain('foreign key (guild_id, source_regear_request_id)')
    expect(sql).toContain('submit_alliance_content_video_from_regear')
    expect(sql).toContain('regear.guild_id = p_guild_id')
    expect(sql).toContain('regear.discord_id = p_discord_id')
    expect(sql).toContain('grant execute on function public.submit_alliance_content_video_from_regear')
    expect(sql).toContain('to service_role')
  })
})
