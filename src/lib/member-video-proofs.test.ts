import { describe, expect, it } from 'vitest'
import { buildMemberVideoProofEntries, type MemberVideoProofSource } from './member-video-proofs'

function makeSource(overrides: Partial<MemberVideoProofSource> = {}): MemberVideoProofSource {
  return {
    id: 'regear-1',
    event_id: 'event-1',
    event_title: 'Crystal Defense',
    role_name: 'Healer',
    status: 'approved',
    created_at: '2026-06-18T12:00:00.000Z',
    video_proof_url: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    video_proof_title: 'Main shotcaller POV',
    ...overrides,
  }
}

describe('buildMemberVideoProofEntries', () => {
  it('keeps only valid video proof links and derives public watch URLs', () => {
    const result = buildMemberVideoProofEntries([
      makeSource(),
      makeSource({
        id: 'regear-2',
        video_proof_url: null,
        video_proof_title: null,
      }),
      makeSource({
        id: 'regear-3',
        video_proof_url: 'https://evil.example/embed/dQw4w9WgXcQ',
      }),
    ])

    expect(result).toEqual([
      {
        id: 'regear-1',
        event_id: 'event-1',
        event_title: 'Crystal Defense',
        role_name: 'Healer',
        status: 'approved',
        created_at: '2026-06-18T12:00:00.000Z',
        video_proof_title: 'Main shotcaller POV',
        watch_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      },
    ])
  })

  it('preserves the source order from the regear history query', () => {
    const result = buildMemberVideoProofEntries([
      makeSource({
        id: 'newer',
        created_at: '2026-06-19T12:00:00.000Z',
        video_proof_url: 'https://www.youtube.com/embed/5NV6Rdv1a3I',
      }),
      makeSource({
        id: 'older',
        created_at: '2026-06-18T12:00:00.000Z',
      }),
    ])

    expect(result.map((entry) => entry.id)).toEqual(['newer', 'older'])
  })
})
