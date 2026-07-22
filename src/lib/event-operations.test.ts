import { describe, expect, it } from 'vitest'
import { createDefaultTacticBoardState } from './tactics/schema'
import {
  mapEventTacticSnapshot,
  normalizeEventAfterActionReview,
} from './event-operations'

describe('normalizeEventAfterActionReview', () => {
  it('turns newline notes into bounded, deduplicated AAR sections', () => {
    expect(
      normalizeEventAfterActionReview({
        summary: `  첫 교전에서 북서쪽 초크를 유지했다.  `,
        wins: '힐러 진형 유지\n힐러 진형 유지\n콜 응답 속도',
        issues: ['  후퇴 콜 지연  ', '', '후퇴 콜 지연'],
        actionItems: Array.from({ length: 12 }, (_, index) => `액션 ${index + 1}`),
      }),
    ).toEqual({
      summary: '첫 교전에서 북서쪽 초크를 유지했다.',
      wins: ['힐러 진형 유지', '콜 응답 속도'],
      issues: ['후퇴 콜 지연'],
      actionItems: [
        '액션 1',
        '액션 2',
        '액션 3',
        '액션 4',
        '액션 5',
        '액션 6',
        '액션 7',
        '액션 8',
      ],
    })
  })
})

describe('mapEventTacticSnapshot', () => {
  it('preserves source step ids so copied branch links remain navigable', () => {
    const boardState = createDefaultTacticBoardState('choke')
    const document = mapEventTacticSnapshot(
      {
        id: 'snapshot-1',
        title: '북서 초크 방어',
        summary: '적 인게이지를 흘린 뒤 역진입',
        terrain_type: 'choke',
        visibility: 'guild',
        tags: ['defense'],
        captured_by: 'caller-1',
        captured_at: '2026-07-22T10:00:00.000Z',
        source_board_updated_at: '2026-07-22T09:00:00.000Z',
      },
      [
        {
          source_step_id: 'source-step-1',
          step_order: 0,
          title: '초크 고정',
          callout: '홀드',
          role_callouts: { tank: '입구를 닫습니다.' },
          intent: '적 전열을 좁힙니다.',
          next_step_links: [
            { id: 'branch-1', label: '적 후퇴', targetStepId: 'source-step-2' },
          ],
          board_state: boardState,
          duration_seconds: 8,
          captured_at: '2026-07-22T10:00:00.000Z',
        },
      ],
    )

    expect(document.board).toMatchObject({
      id: 'snapshot-1',
      title: '북서 초크 방어',
      terrainType: 'choke',
      status: 'published',
      visibility: 'guild',
      updatedAt: '2026-07-22T09:00:00.000Z',
      stepCount: 1,
    })
    expect(document.steps[0]).toMatchObject({
      id: 'source-step-1',
      title: '초크 고정',
      nextStepLinks: [
        { id: 'branch-1', label: '적 후퇴', targetStepId: 'source-step-2' },
      ],
      boardState,
    })
  })
})
