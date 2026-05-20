// Server-side Supabase Realtime Broadcast helper.
//
// Why broadcast (not postgres_changes): 우리 세션은 HMAC 쿠키 기반 → Supabase
// JWT 가 없어서 postgres_changes 의 RLS 행 필터링이 작동 안 함. broadcast 모드는
// 서버가 명시적 토픽으로 발화 → 클라이언트가 구독. RLS 우회.
//
// 토픽은 길드별 (`<scope>:<guildId>`) 로 구분. 채널 이름만 알면 누구나 구독
// 가능하지만 killboard 데이터는 Albion API 로 누구나 조회 가능한 공개 데이터
// (이미 /battles 페이지에서 노출) 라 별도 인증 게이트 불필요.

const REALTIME_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export type RealtimeScope = 'killboard' | 'battles' | 'regear'

export interface RealtimeBroadcastPayload {
  count: number
  ts: string
}

export async function broadcastGuildEvent(
  scope: RealtimeScope,
  guildId: string,
  count: number,
): Promise<void> {
  if (count <= 0) return
  if (!REALTIME_URL || !SERVICE_KEY) return

  const url = `${REALTIME_URL}/realtime/v1/api/broadcast`
  const payload: RealtimeBroadcastPayload = {
    count,
    ts: new Date().toISOString(),
  }
  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
      },
      body: JSON.stringify({
        messages: [
          {
            topic: `${scope}:${guildId}`,
            event: 'insert',
            payload,
          },
        ],
      }),
    })
  } catch {
    // Broadcast 실패는 non-fatal — DB row 는 이미 commit 됐고 다음 페이지
    // reload 에서 보임. realtime delivery 실패로 cron 자체를 깨트리지 않는다.
  }
}
