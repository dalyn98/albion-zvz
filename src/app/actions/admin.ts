// 어드민 액션 배럴. 25+ 호출부가 `@/app/actions/admin` 에서 import 하므로
// 경로를 유지하고 구현은 3-way 분리 — event / slot-sanitizers / party-slot.
//
// - admin-event.ts          'use server', 이벤트 라이프사이클 + Discord 알림
// - admin-slot-sanitizers.ts 순수 헬퍼, 'use server' 와 무관
// - admin-party-slot.ts     'use server', 파티/슬롯 액션

export type { SlotPayload, PartyMetaPayload } from './admin-slot-sanitizers'

export {
  createDraftEvent,
  createEvent,
  updateEvent,
  getEventPublishSummary,
  publishEvent,
  notifyEvent,
  cloneEvent,
  deleteEvent,
  startBattle,
} from './admin-event'

export {
  savePartySlots,
  clearSlotAssignment,
  updateSingleSlot,
} from './admin-party-slot'
