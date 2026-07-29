import {
  AGM_COMMAND_PATHS,
  type AgmCommandPath,
} from '@/lib/discord-command-suite-shared'

export type DiscordChannelMode =
  | 'discord-read'
  | 'discord-simple-action'
  | 'discord-confirmed-action'
  | 'web-workflow'

export interface DiscordChannelCatalogEntry {
  mode: DiscordChannelMode
  mutation: boolean
  webPath: string
  reason: string
}

const read = (webPath: string, reason: string): DiscordChannelCatalogEntry => ({
  mode: 'discord-read',
  mutation: false,
  webPath,
  reason,
})

const simple = (webPath: string, reason: string): DiscordChannelCatalogEntry => ({
  mode: 'discord-simple-action',
  mutation: true,
  webPath,
  reason,
})

const confirmed = (webPath: string, reason: string): DiscordChannelCatalogEntry => ({
  mode: 'discord-confirmed-action',
  mutation: true,
  webPath,
  reason,
})

const web = (webPath: string, reason: string): DiscordChannelCatalogEntry => ({
  mode: 'web-workflow',
  mutation: false,
  webPath,
  reason,
})

export const DISCORD_CHANNEL_CATALOG = {
  setup: simple('/admin/dashboard/guide', '봇을 초대한 서버 관리자의 단일 self-serve 연결'),
  login: simple('/login', '브라우저에 표시된 1회용 로그인 코드를 본인이 승인'),
  help: read('/docs/discord/commands', '명령 탐색'),
  'me.summary': read('/me', '개인 운영 상태 요약'),
  'me.verify': web('/me/profile', 'Albion 캐릭터 검색·소유권 확인·충돌 해결'),
  'event.next': read('/events', '다음 이벤트 확인'),
  'event.browse': read('/events', '공개된 이벤트와 빈 슬롯 탐색'),
  'event.status': read('/me', '본인의 신청 상태 확인'),
  'event.cancel': simple('/events', '본인 소유 신청 한 건의 취소; 복합 배정은 웹으로 이관'),
  'wallet.balance': read('/me/wallet', '현재 잔액과 사용 가능 포인트 확인'),
  'wallet.send': confirmed('/me/wallet', '포인트 원장에 즉시 반영되는 금전성 단건 변경'),
  'wallet.withdraw': simple('/me/wallet', '운영진 승인 전까지 대기 상태인 출금 신청'),
  'wallet.history': read('/me/wallet', '본인 원장 내역 확인'),
  'stats.me': read('/me', '본인 전투 통계 확인'),
  'stats.member': read('/members', '길드원 전투 통계 확인'),
  'stats.leaderboard': read('/leaderboard', '길드 순위 확인'),
  'stats.battle': read('/battles', '공식 교전 결과 확인'),
  'regear.eligible': web('/regear', '전투·역할·정책·사망별 복합 신청 판단'),
  'regear.status': read('/me', '본인의 최근 리기어 상태 확인'),
  'craft.queue': read('/craft/queue', '수주 가능한 제작 작업 확인'),
  'craft.mine': read('/craft/my-tasks', '본인이 맡은 제작 작업 확인'),
  'craft.claim': simple('/craft/queue', '대기 작업 한 건을 본인에게 배정'),
  'craft.release': simple('/craft/my-tasks', '본인 작업 한 건을 대기열로 반환'),
  'craft.deliver': confirmed('/craft/queue', '납품·완제품 재고·제작 정산 상태를 함께 변경'),
  'craft.pickup': simple('/me', '신청자가 본인 상자 수령 한 건을 확인'),
  'siphon.balance': read('/me/siphon', '게임 로그 기반 사이폰 잔액 확인'),
  'siphon.history': read('/me/siphon', '게임 로그 기반 사이폰 내역 확인'),
  'shop.status': read('/shop', '본인의 주문 상태 확인'),
  'shop.order': confirmed('/shop', '재고를 예약하고 향후 포인트 승인을 만드는 주문'),
  'shop.reorder': confirmed('/shop', '현재 가격·재고로 새 주문을 생성'),
  'admin.approvals': simple('/admin/dashboard/approvals', '기존 항목별 요약·확인 UI가 있는 단건 승인'),
  'admin.event-create': simple('/admin/dashboard/events', '공개되지 않은 이벤트 초안 한 건 생성'),
  'admin.event-start': confirmed('/admin/dashboard/events', '참가·리기어 정책 스냅샷을 동결하는 비가역 시점 기록'),
  'admin.points': simple('/admin/dashboard/members', '필수 사유와 감사 기록이 붙는 관리자 단건 정정'),
  'admin.quick-publish': simple('/admin/dashboard/guide', '빠른 실행 패널 한 건 발행 또는 갱신'),
  'admin.dashboard': web('/admin/dashboard', '구성·대량 처리·분쟁·복합 예외 운영'),
} satisfies Record<AgmCommandPath, DiscordChannelCatalogEntry>

export function listDiscordChannelCatalog(
  mode?: DiscordChannelMode,
): Array<{ path: AgmCommandPath; entry: DiscordChannelCatalogEntry }> {
  return AGM_COMMAND_PATHS
    .map((path) => ({ path, entry: DISCORD_CHANNEL_CATALOG[path] }))
    .filter(({ entry }) => !mode || entry.mode === mode)
}
