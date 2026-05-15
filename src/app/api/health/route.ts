import { NextResponse } from 'next/server'

// Public health check. 외부 모니터링 / 업타임 체커가 200 + ok=true 를 보면
// 서비스 가동 중. DB / Discord 같은 외부 의존은 확인하지 않는다 — 의존성 장애를
// 헬스체크가 알리면 그 외 cron / 배포 게이트가 죽기 때문. 의존성 상태는 별도 페이지.
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(
    { ok: true, uptime: process.uptime(), ts: Date.now() },
    { headers: { 'cache-control': 'no-store' } },
  )
}
