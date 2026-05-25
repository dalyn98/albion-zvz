import { CAP } from '@/lib/permissions'

// 자유 리기어 창구 운영 권한. 라우트 접근과 server action mutation 이 같은
// capability set 을 써야 delegated officer 가 화면만 보고 작업은 실패하는
// drift 를 막을 수 있다.
export const REGEAR_WINDOW_MANAGE_CAPS = [
  CAP.REGEAR_APPROVE,
  CAP.SETTINGS_TOGGLES,
] as const
