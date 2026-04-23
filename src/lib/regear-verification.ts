// 리기어 서버 액션이 알비온 닉네임 인증 미완료로 거절할 때 에러 문자열에
// 붙이는 프리픽스. 클라이언트가 이 프리픽스를 보고 /onboarding/albion 으로
// 안내하는 CTA 를 렌더한다.
//
// 'use server' 파일에서는 async 함수만 export 할 수 있어, 서버/클라이언트가
// 공유할 수 있도록 별도 모듈로 분리.
export const REGEAR_VERIFICATION_ERROR_PREFIX = 'ALBION_VERIFICATION_REQUIRED:'
