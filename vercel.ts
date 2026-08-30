import type { VercelConfig } from '@vercel/config/v1'

export const config: VercelConfig = {
  // Supabase is hosted in ap-southeast-2, but the syd1 -> Supabase REST path can
  // fail independently while the project remains reachable from Northeast
  // Asia. Keep compute in Seoul so the public site, Discord interactions, and
  // cron handlers share the verified healthy path. The added DB latency is a
  // deliberate availability trade-off; static assets still use Vercel's CDN.
  regions: ['icn1'],
  // 유지보수 종료 후에는 자동 리기어의 end-to-end 체인만 실행한다.
  // 이벤트 시작/참가 확정, 전투·킬보드 수집, 홈 길드 자격 갱신은 자동
  // 리기어의 정확성·안전성에 직접 필요하므로 유지한다. 그 외 주기 작업은
  // 불필요한 Vercel Function/외부 API/AI 사용량을 막기 위해 등록하지 않는다.
  crons: [
    { path: '/api/cron/battle-tracker', schedule: '*/5 * * * *' },
    { path: '/api/cron/killboard-sync', schedule: '1-59/5 * * * *' },
    { path: '/api/cron/auto-regear', schedule: '2-59/10 * * * *' },
    { path: '/api/cron/event-auto-start', schedule: '* * * * *' },
    {
      path: '/api/cron/event-participation-notifications',
      schedule: '6-59/10 * * * *',
    },
    { path: '/api/cron/account-albion-sync', schedule: '30 19 * * *' },
  ],
}
