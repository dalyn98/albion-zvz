import { youtubeVideoProofWatchUrl } from './regear-video-proof'

export type MemberVideoProofStatus = 'pending' | 'approved' | 'rejected'

export interface MemberVideoProofSource {
  id: string
  event_id: string | null
  event_title: string
  role_name: string
  status: MemberVideoProofStatus
  created_at: string
  video_proof_url: string | null
  video_proof_title: string | null
}

export interface MemberVideoProofEntry {
  id: string
  event_id: string | null
  event_title: string
  role_name: string
  status: MemberVideoProofStatus
  created_at: string
  video_proof_title: string | null
  watch_url: string
}

export function buildMemberVideoProofEntries(
  sources: ReadonlyArray<MemberVideoProofSource>,
): MemberVideoProofEntry[] {
  return sources.flatMap((source) => {
    const watchUrl = youtubeVideoProofWatchUrl(source.video_proof_url)
    if (!watchUrl) return []

    return [
      {
        id: source.id,
        event_id: source.event_id,
        event_title: source.event_title,
        role_name: source.role_name,
        status: source.status,
        created_at: source.created_at,
        video_proof_title: source.video_proof_title,
        watch_url: watchUrl,
      },
    ]
  })
}
