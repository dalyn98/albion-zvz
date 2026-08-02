# 제품 개발 의도 레지스트리

- 기준일: 2026-08-02
- 기준 코드: `0a6f41d7` + Release C migration 358 로컬 milestone
- 요구사항 원본: 이 프로젝트의 제품 Q&A, `CONTEXT.md`,
  `UBIQUITOUS_LANGUAGE.md`, `docs/guild-operating-model-final-design.md`
- 제외 범위: 전투로그 수집·전투 집계·공개 전투 탐색과 관련된 상세 기능
- 상태 값: `구현 완료` / `부분 구현` / `개발 의도와 다르게 구현` /
  `아직 구현되지 않음` / `제거하거나 축소하기로 결정`

이 문서는 “화면이 존재한다”를 완료로 보지 않는다. 사용자 흐름, 서버 권한,
DB 불변식, 회귀 테스트가 함께 확인된 경우에만 `구현 완료`로 분류한다. 각
milestone을 마칠 때 상태와 증거를 갱신하며, 상세한 도메인 설명은 위 원본
문서에 두고 여기서는 추적 가능한 계약과 실행 상태만 관리한다.

## 1. 온보딩·인증·회원 생애주기·다중 길드

| ID | 확정 개발 의도 | 현재 상태 | 현재 증거와 gap | 배포 단위 |
|---|---|---|---|---|
| MEM-01 | Discord 사용자, 길드 회원 기록, Albion 캐릭터는 서로 다른 신원이다. 업무 이력의 주체는 안정적인 길드 회원 기록이다. | 구현 완료 | migration 321의 이벤트·리기어 소유권에 이어 migration 358이 포인트·환전·기부·상점·회원 거래·제작·Menhera 업무를 tenant 복합 FK와 안정 회원 UUID로 투영한다. 기존 Discord 값은 감사·호환 증거로 보존하고 개인 read·본인 mutation·Discord 명령은 안정 주체를 사용한다. | C |
| MEM-02 | 같은 Discord 사용자는 여러 길드에 각각 독립적인 회원 기록을 가질 수 있다. | 구현 완료 | 활성 회원 기록 기반 `/me/guilds`와 live Discord 권한 재검증을 포함한 길드 전환 API를 구현했다. 단일 길드 사용자는 전환 메뉴를 보지 않으며 길드별 업무 요약을 합산하지 않는다. | A |
| MEM-03 | 같은 공식 server/player ID의 Albion 캐릭터는 동시에 한 길드에만 활성 연결된다. 닉네임은 고유 키가 아니다. | 구현 완료 | migration 315의 partial unique와 318 ambiguity guard, 통합 테스트가 존재한다. | 배포됨 |
| MEM-04 | 동일 길드 재가입은 새 회원 UUID를 만들지 않고 기존 기록을 재활성화한다. | 구현 완료 | Phase 2A dual-write가 기존 UUID를 재활성화하며 migration 321의 안정 디렉터리와 다중 길드 선택 경로가 그 UUID를 사용한다. 재시도·재가입 통합 테스트가 UUID 재사용을 고정한다. | A |
| MEM-05 | 로컬 계정을 Discord에 연결해도 같은 길드의 회원 기록과 이력 주체가 유지된다. | 구현 완료 | 계정 연결 dual-write가 같은 UUID를 유지하며 migrations 321·358이 이벤트·리기어·포인트·거래·제작·Menhera의 과거 raw subject를 재작성하지 않고 동일 안정 회원으로 읽고 처리한다. 연결 전후 잔액·대기 업무·제작 전달·영상 의무 회귀를 실제 Postgres에서 검증한다. | C |
| MEM-06 | 캐릭터 이전 뒤에도 이전 길드의 포인트·이벤트·리기어 이력은 이동하지 않는다. | 구현 완료 | migration 323이 새 길드의 신뢰된 공식 홈 길드 증거에만 반응해 이전 재적 종료·이전 회원 비활성화·새 재적 시작·양쪽 감사를 한 transaction으로 처리한다. 기존 포인트·이벤트·리기어 소유권 무변경을 통합 테스트한다. | A |
| MEM-07 | 확인된 Albion 이름, 길드별 표시명, Discord 서버 닉네임을 분리한다. 운영진은 길드별 표시명을 편집할 수 있고 Discord 적용은 명시적 단건 작업이다. | 구현 완료 | migration 321의 길드별 표시명 override·감사 RPC와 안정 디렉터리 표시 우선순위, 관리자 편집 UI를 구현했다. Discord 적용은 별도 명시 버튼으로만 실행된다. | A |
| MEM-08 | Discord 닉네임은 최초 연결, 실제 캐릭터명 변경, 운영진의 명시적 재적용 때만 best-effort로 바꾼다. 일반 refresh는 사용자의 변경을 덮지 않는다. | 구현 완료 | 최초 신뢰 연결·운영진 승인/명시 적용은 기존 best-effort 경로를 유지하고, refresh는 API가 확인한 이전/현재 캐릭터명이 실제로 달라진 경우에만 재적용한다. 동일 이름 refresh 회귀 테스트가 있다. | A |
| MEM-09 | 일반 회원 명부는 활성 회원의 안전한 신원·역할·긍정적 활동만 보여준다. 게스트·탈퇴·미연결·신원 문제는 운영진 명부에만 둔다. | 부분 구현 | 일반/운영진 route와 capability 경계는 분리됐지만 legacy Discord DTO와 일부 직접 URL 경계를 더 검증해야 한다. | C |
| MEM-10 | 한 길드의 회원·잔액·권한·이벤트는 다른 길드와 절대 합산하거나 혼입하지 않는다. | 구현 완료 | 다수 tenant integration test와 모든 업무 테이블의 `guild_id` 경계가 존재한다. Phase 2B에서도 유지해야 한다. | 지속 |
| ONB-01 | 신규 길드는 Discord 역할·공지 채널·길드 시간대·Albion 홈 길드와 리기어 미지원/지원 정책을 명시적으로 선택해야 활성화된다. | 구현 완료 | migration 324의 단일 activation command가 봇 설치, 회원·관리자 역할, 공지 채널, 길드 시간대, 공식 서버·홈 길드, 리기어 지원/방식, 이벤트 자동 시작 결정을 원자적으로 검증한다. wizard의 마지막 단계도 이 command를 거쳐야만 `active`가 된다. | A |
| ONB-02 | 선택 기능과 7단계 가이드는 activation을 막지 않으며 첫 이벤트까지 self-serve로 이어진다. | 구현 완료 | migration 324의 activation command는 필수 운영 기준만 검사한다. 완료 직후 대시보드의 first-run panel이 첫 이벤트 생성·길드원 초대·Discord 시험 공지·선택 가이드를 독립 action으로 제공하고, 가이드 미완료는 길드 접근을 막지 않는다. | A |
| ONB-03 | 홈 길드 연결은 소유권 인증이 아니다. 정상 도입에는 수동 승인이 없고 중복 연결·신빙성 있는 사칭 신고만 분쟁으로 다룬다. | 구현 완료 | migration 352가 신고·검토·기각·양도·취소의 예외 lifecycle을 추가한다. 정상 onboarding은 승인 없이 유지하고, 열린 분쟁 동안만 공개 프로필을 fail-closed로 숨기며 operator가 증거를 보고 명시적으로 처리한다. | C |
| LIFE-01 | 봇 제거·장기 미사용은 데이터 보존형 일시 정지이고 자동 삭제가 아니다. | 구현 완료 | migrations 325·326·328이 사유 있는 보존형 suspension, 세션·게스트·공개 링크·outbox 차단과 재활성화 readiness를 정의한다. Discord 404만 bot-removal suspension으로 처리하고 transient 오류는 보존한다. 장기 미사용은 30일 후보 표시와 운영자 안내 뒤의 명시적 정책 정지만 허용하며 자동 삭제 command는 존재하지 않는다. | A |
| LIFE-02 | 영구 삭제는 열린 의무 확인, 권한자의 명시적 요청, 30일 철회 기간, guild-scoped purge를 거친다. | 구현 완료 | migrations 325~327과 lifecycle UI/cron이 전용 capability, live Discord 권한, 10분 재인증, 정확한 길드명, 열린 의무 차단, 30일 철회, claim/receipt purge와 익명 tombstone을 구현한다. FK·스토리지 scope audit와 실제 로컬 purge 시뮬레이션에서 전역 신원·다른 길드 보존을 확인했다. | A |
| LEG-01 | 임의로 추가된 체험 멤버와 부재 일정 기능은 잔존 데이터 확인 후 제거하고 어떤 운영 판정도 이에 의존하지 않는다. | 구현 완료 | 회원·설정·이벤트 UI와 action/read 모듈을 제거했다. migration 322는 서비스 역할의 신규 쓰기와 두 RPC 실행을 차단하되 기존 행과 명시적 계정 병합 보존 경로는 삭제하지 않는다. 운영 row 수는 배포 승인 경계에서 익명 집계한다. | A |
| LANG-01 | 개인 UI·개인 DM 언어는 사용자 전역 하나이고, 길드 공용 문구는 길드 기본 언어다. 작성 원문은 자동 번역하지 않는다. | 구현 완료 | migration 351의 Discord 전역 접근 선호가 기존 avatar/guest 값을 결정적으로 백필하고 이후 guild row 쓰기도 전역 값으로 동기화한다. 웹 언어·개인 DM 시간대는 전역 선호를 사용하고 길드 공용 언어·시간대와 작성 원문은 길드 범위에 남는다. | C |

## 2. 이벤트 생성·참가·종료·실제 참가

| ID | 확정 개발 의도 | 현재 상태 | 현재 증거와 gap | 배포 단위 |
|---|---|---|---|---|
| EVT-01 | draft→모집→운영 시작을 구분하고, 발행 이벤트는 집결 시각에 관리자 조작 없이 한 번 시작한다. 실제 전투 시작 시각과는 별개다. | 구현 완료 | migration 329가 최초 발행과 1시간 운영 경계를 고정하고 모든 신규 발행 이벤트를 필수 자동 시작 대상으로 만든다. cron은 집결 시각을 그대로 기록하며 수동 command는 집결 전 조기 운영 시작만 제공한다. | A |
| EVT-02 | 싸움이나 리기어 신청이 없는 이벤트도 정상 종료할 수 있다. | 구현 완료 | `operational_ended_at`은 운영 시작 정확히 1시간 뒤로 DB가 고정한다. 객관적 closeout은 battle·regear·loot가 0건이어도 정상 상태를 보여주고 참가 마감만 실제 운영진 확정이 필요하다. | A |
| EVT-03 | 비회원·연합 참가자는 다회용 로그인 없는 게스트 링크로 이벤트에 접근할 수 있고 Discord OAuth는 선택이다. | 구현 완료 | migration 331과 게스트 전용 화면이 단체 모집 링크를 로그인 없는 event-scoped 진입으로 사용한다. 슬롯 신청과 개인 관리 링크는 한 transaction으로 발급하며 원문 secret·IP를 저장하지 않는다. 관리 secret은 URL fragment에서 same-origin POST로 교환해 요청 URL에도 노출하지 않는다. 운영 시작 뒤 프로필·신청 변경 잠금, 캐릭터 중복·경합 rollback, 링크 재발급을 통합 테스트한다. | A |
| EVT-04 | 일반 슬롯은 자동 배정하고 caller·야간조·선호 모집은 운영진 승인을 요구한다. | 구현 완료 | 일반 슬롯은 `assign_slot`에서 즉시 배정되고 밤스쿼드 슬롯은 pending request 뒤 운영진·caller 승인으로만 확정된다. 빌드 선호 모집은 신청을 pending으로만 저장하고 operator 배정 전 슬롯을 만들지 않는다. 웹·Discord가 같은 상태를 표시하며 독립 단위·통합 테스트가 두 경계를 고정한다. | A |
| EVT-05 | 참가예정은 약한 가용성 신호다. 승인 대기 중 유지되고 확정 배정 때만 종료되며 출석·보상·리기어·통계 근거가 아니다. | 구현 완료 | migration 301, snapshot/cleanup trigger, 웹·Discord·통합 테스트가 존재한다. | 배포됨 |
| EVT-06 | 실제 참가자는 사이트가 자동 확정하지 않는다. 운영진이 배정 명단을 기본 선택하고 예외만 수정해 한 번 최종 확정한다. | 구현 완료 | migration 302와 `EventParticipationCloseoutPanel`, 원자적 RPC·통합 테스트가 존재한다. Discord 없는 게스트도 슬롯 신원으로 같은 마감 명단에 들어가며 DM은 안전하게 skip한다. | A |
| EVT-07 | 참여 보상은 확정 참가만으로 지급하고 death/regear와 분리한다. 특별 보상과도 분리한다. | 구현 완료 | participation closeout이 공통 금액과 원장을 원자적으로 확정하며 신규 approval queue를 만들지 않는다. | 배포됨 |
| EVT-08 | 종료 이벤트의 일정·편성·유효 정책·장비 기준은 불변이고 사후 정정은 append-only 기록이다. | 구현 완료 | migration 329가 운영 시작 뒤 이벤트 핵심 필드와 parties·slots·build 모집 관계의 직접 mutation·삭제를 DB에서 차단한다. 실제 참가 예외는 기존 원자적 closeout 기록으로만 확정한다. | A |
| EVT-09 | 이벤트 복제는 새 draft만 만들며 배정·신청·참가·보상·리기어·제작·루팅 이력을 복사하지 않는다. | 구현 완료 | `cloneReusableEventConfiguration`이 새 길드/이벤트 ID와 +7일 일정을 가진 draft 구성만 만든다. 사람·caller·신청·운영·AAR 등 이력 table 미조회와 배정 필드 제거를 source/unit test가 검증한다. | A |
| EVT-10 | 독립 AAR·MVP·잘한 점/문제점 평가는 제거한다. 종료 이벤트 상세에는 객관적인 참가 대조와 미완료 업무만 자동 표시한다. | 구현 완료 | AAR action·component·주관적 승패/KD/MVP 표현을 제거했다. migration 330은 과거 AAR을 service-role SELECT 전용 archive로 보존하고 신규 직접 쓰기를 차단하며, closeout은 참가·연결 기록·리기어·루팅의 객관적 상태만 표시한다. | A |
| EVT-11 | 길드 시간대가 일정·마감·자동화·주 경계를 결정하고 개인 시간대는 개인 화면/DM 표시만 바꾼다. | 부분 구현 | 길드 시간대와 일부 개인 표시가 있지만 개인 언어/시간대가 legacy 회원 row에 묶여 있고 주 경계 일관성 감사가 남았다. | C |

## 3. 리기어

| ID | 확정 개발 의도 | 현재 상태 | 현재 증거와 gap | 배포 단위 |
|---|---|---|---|---|
| RGR-01 | 길드별 리기어 상태를 미지원/지원으로 명시하고 지원 길드만 실버/제작을 고른다. | 구현 완료 | ADR 0002와 migrations 313~314, 온보딩·웹·Discord·cron 차단 테스트가 존재한다. | 배포됨 |
| RGR-02 | 이벤트 시작 시 참가자·역할별 최종 유효 정책을 하나의 snapshot으로 고정하고 수동·자동·제작 신청 모두 같은 기준을 사용한다. | 구현 완료 | migration 298과 effective-policy server/unit/integration test가 존재한다. | 배포됨 |
| RGR-03 | 리기어는 실제 참가 뒤 지원 기준에 맞는 death가 있을 때만 신청한다. 청구자는 pending 상태에서 부위별 가격을 편집할 수 있다. | 구현 완료 | migration 332가 기존 이벤트는 보존하고 신규 이벤트의 신청을 `included` 실제 참가 closeout에 연결한다. 수동·자동 모두 같은 명단을 사용하며 closeout 전 자동 처리는 완료 마킹 없이 연기된다. 게스트는 이벤트별 명시적 opt-in, 수동 death pending만 허용하고 Discord role 정책·자동·오버차지를 차단한다. | A |
| RGR-04 | 자유 리기어 창구는 실제 리기어 통계에는 포함하지만 참가율·참여 보상·성과 통계에는 절대 포함하지 않는다. | 구현 완료 | migrations 299~300의 origin invariant와 stats filter/test가 존재한다. | 배포됨 |
| RGR-05 | 리기어 미지원으로 전환해도 기존 기록은 읽기 전용으로 보존한다. | 구현 완료 | 313~314 이후 member/admin/craft 화면의 read-only 경계와 테스트가 존재한다. | 배포됨 |
| RGR-06 | disabled 상태는 nav, 직접 route/action, Discord, 자동 regear cron에서 일관되게 차단한다. | 구현 완료 | regear support server boundary와 route/action/cron/Discord 테스트가 존재한다. | 배포됨 |

## 4. 보상·제작 전달·완제품 재고

| ID | 확정 개발 의도 | 현재 상태 | 현재 증거와 gap | 배포 단위 |
|---|---|---|---|---|
| SUP-01 | 재료 출처와 제작 수수료는 독립이다. 길드 지원 제작은 수수료 0이 가능하고 개인 재료는 재료비를 상환할 수 있다. | 구현 완료 | migration 335가 claim 시 재료 출처·수수료 방식을 독립적으로 고정한다. 네 조합 모두의 재료 상환·수수료·총액과 재시도 안전성을 PostgreSQL 통합 테스트한다. | B |
| SUP-02 | 박스 전달은 이행 완료가 아니라 회원 수령 대기다. 제작자 정산 권리는 박스에 넣는 순간 발생한다. | 구현 완료 | 원자적 delivery command가 `ready_for_pickup`과 payable 정산 권리를 함께 만들고, 실제 수령은 별도 `completed` command로만 전환한다. | B |
| SUP-03 | 원재료가 아니라 완제품만 관리한다. 박스 전달 때 완제품 재고를 차감하며 부족분은 외부 조달로 기록하고 전달을 막지 않는다. | 구현 완료 | migration 335의 append-only 완제품 movement와 outside-stock evidence가 delivery transaction에 묶였다. 기준선·차감·명시적 미수령 반납·재시도 재고 수량을 통합 검증한다. | B |
| SUP-04 | 보급 상태·재고·지급 원장·중요 변경 기록은 한 transaction으로 성공하거나 실패한다. | 구현 완료 | 하나의 fulfillment root 아래 상태 event, 완제품 원장, 외부 조달 증거, 정산 entitlement, admin audit, outbox, application-command receipt를 원자적으로 기록한다. tenant 복합 FK·service-role wrapper·trigger 비공개와 이중 지급 차단을 검증했다. | B |
| SUP-05 | 수령 기한이 지나도 박스를 자동 해제하지 않는다. 회원 확인, 명시적 미수령 반납, 박스 이동만 상태를 바꾼다. | 구현 완료 | 기존 expiry cron은 `receipt_overdue` 후속 확인만 표시하고 task·박스를 바꾸지 않는다. 수령, 제작 마스터의 명시적 반납, 출고/마스터의 박스 이동만 custody를 바꾸며 모두 idempotent하다. | B |
| SHOP-01 | 일반 상점 주문은 재고와 포인트를 원자적으로 예약해 자동 접수하고 운영진은 전달만 한다. | 구현 완료 | shop order application command, reservation RPC, hold·재고 테스트가 존재한다. | 배포됨 |
| SHOP-02 | 시세 불확실 때만 가격 재검토한다. 인상은 회원 재확인, 동일/인하는 재확인 없이 진행하며 업무 가격은 고정된다. | 구현 완료 | migration 337이 인상 제안을 주문과 분리하고 회원 본인 재확인 전 승인을 차단한다. 동일·인하는 바로 승인할 수 있으며 접수 원가와 최종 업무 가격을 각각 보존하고 이행 시작 뒤 가격을 동결한다. | B |
| SHOP-03 | 전체 완제품 재고 베이스라인은 최초 도입·불일치 복구에만 사용하는 예외 조치다. | 구현 완료 | baseline/reset을 일상 상점 화면에서 제거하고 별도 복구 센터로 격리했다. migration 337의 idempotent wrapper가 실행 명령과 전후 스냅샷을 recovery receipt로 남긴다. | B |
| TRADE-01 | 회원 거래는 같은 길드 포인트 escrow를 쓰지만 길드 상점·기부·길드 재정과 분리한다. | 구현 완료 | member trade lifecycle/escrow RPC와 통합 테스트가 존재한다. | 유지 |

## 5. 포인트·상점·기부·재정 기록

| ID | 확정 개발 의도 | 현재 상태 | 현재 증거와 gap | 배포 단위 |
|---|---|---|---|---|
| ECO-01 | 정상 포인트→실버 환전은 포인트를 먼저 hold해 자동 접수하고 운영진은 실제 인게임 지급만 완료한다. | 구현 완료 | migration 336이 신청 transaction에서 spendable 포인트를 검증·hold하고 지급 완료 때 소비, 거절 때 해제한다. migration 342는 DB 선적용 배포 창의 구버전 직접 쓰기도 fail-closed 처리하고, 343은 복구 명령이 대기 신청을 닫을 때 hold를 함께 해제한다. 운영진 화면은 정책 승인 대신 인게임 지급 완료/거절만 처리한다. | B |
| ECO-02 | 금고 로그는 입금자·금액·시각만 증명한다. 회원이 미배정 입금의 용도를 포인트로 지정하고 결정적 일치만 자동 적립하며 예외만 운영진이 본다. | 구현 완료 | migration 336이 원본 금고 증거와 회원 작성 allocation을 분리한다. 신뢰 가능한 닉네임이 단일 회원과 정확히 일치한 포인트 충전만 원자 자동 적립하고, 모호·불일치는 운영진 예외함에 남긴다. | B |
| ECO-03 | 회원 간 포인트 양도는 즉시 선물/개인 정산이고, idempotency key로 재시도를 한 번만 처리한다. 물품 거래에는 사용하지 않는다. | 구현 완료 | `point.transfer` application command와 web/Discord idempotency 테스트가 존재한다. | 배포됨 |
| ECO-04 | 특별 보상은 예외 상황에만 전용 권한자가 한 번 강하게 확인해 지급한다. 동일 금액만 한 grant로 묶고 일반 참가 보상 queue가 아니다. | 구현 완료 | migration 336이 전용 capability와 동일 금액 batch command를 추가한다. `SPECIAL REWARD` 확인 문구, 활성 회원 검증, idempotency를 강제하며 일반 참가 보상 승인함과 분리된 화면에서만 실행한다. | B |
| ECO-05 | 사이펀은 기록 모드와 개인 보관 장부 모드 중 길드가 선택한다. 기록 모드 음수는 업무가 아니며 어느 모드도 자동 제재하지 않는다. | 구현 완료 | 길드 설정으로 `record`와 `personal_custody`를 선택한다. 기존 길드는 보관 장부가 기본이며 기록 모드는 웹·Discord에서 입출고 활동량만 중립적으로 표시하고 음수·부채·제재 의미를 사용하지 않는다. | B |
| ECO-06 | 루팅 회수는 이벤트 품목 총량으로 판정하고 개인 기록은 조사 근거일 뿐 자동 책임/제재가 아니다. | 구현 완료 | loot audit는 `item_pool` 범위에서 길드/연합별 품목 총량을 판정하고 개인 행은 출처 조사 근거로만 보존한다. 결과가 포인트·리기어·권한·자동 제재를 변경하는 write path는 없다. | 유지 |
| ECO-07 | 월말 포인트 잔액 정산 기능은 폐기하고 과거 schema만 호환 목적으로 보존한다. | 제거하거나 축소하기로 결정 | 어드민·회원 정산 route와 상세 route는 각각 현재 승인함/요청함으로 redirect되고 sidebar 신규 진입점은 없다. 과거 schema와 URL 호환만 보존한다. | 유지 |
| BAK-01 | 백업은 현재 잔액·재고·hold·escrow·열린 의무와 최소 참조만 같은 길드에 원자 복원한다. 완료 이력·템플릿은 제외한다. | 부분 구현 | migrations 303~304와 preview/restore UI가 있으나 allowlist와 운영 recovery 경계를 최종 검증해야 한다. | C |

## 6. Menhera 영상 게이트·업적·전투 성과

| ID | 확정 개발 의도 | 현재 상태 | 현재 증거와 gap | 배포 단위 |
|---|---|---|---|---|
| MEN-01 | 콘텐츠 준수는 Menhera 전용 관찰 기능이며 미준수로 참가·리기어·포인트·권한을 제한하지 않는다. | 구현 완료 | migrations 294~295와 tenant guard, 전용 capability 및 테스트가 존재한다. | 배포됨 |
| MEN-02 | Menhera의 새 포인트→실버 환전에만 최근 5일 유효 영상 1개를 요구한다. 업로드 성공 즉시 승인 없이 해제하고 기존 신청은 소급 변경하지 않는다. | 구현 완료 | migrations 289, 294~296의 원래 경계에 migration 358이 연결된 Discord 신원 전체의 의무·최근 영상·1분 제한·환전 gate를 같은 안정 회원으로 묶는다. 다른 연결 신원에서 의무를 중복 생성하거나 제한을 우회하지 못함을 통합 검증한다. | C |
| ACH-01 | 업적은 긍정적·비경제적이며 최초 획득을 길드 회원 기록에 영구 보존한다. 포인트·리기어·권한·준수에 연결하지 않는다. | 구현 완료 | migration 338이 기존 업적을 정확한 tenant access identity로 백필해 안정 회원 UUID를 필수 소유자로 만든다. 새 기록은 trigger로 투영하고 회원 기록 병합 때 영구 이력을 정식 주체로 이동하며, Discord 값은 획득 당시 호환 증거로 보존한다. | B |
| ACH-02 | 팀 전투 위업을 주 트랙으로 하고 공식 판정의 확인 참가자 모두에게 한 번씩 지급한다. | 구현 완료 | achievement evaluator와 unique evidence 제약·통합 테스트가 존재한다. 전투 판정 자체는 본 Goal에서 수정하지 않는다. | 유지 |
| ACH-03 | 개인 전투 업적은 킬 기여·생존처럼 직접 관측된 사실만 보조 트랙으로 제공하고 종합 실력/MVP를 만들지 않는다. | 구현 완료 | 개인 트랙은 공식 kill event·관측된 무사망 연속·참가 milestone만 사용한다. BadgeGrid는 영구 ledger만 표시하고 이벤트 리포트는 직접 관측 kill 목록만 제공하며, migration 330이 주관적 AAR 신규 쓰기를 폐기했다. | 유지 |
| WPN-01 | 무기 사용 통계는 실제 관측 장비를 전투·무기군별 한 번 집계하고 슬롯 배정·숙련도·보상 판단과 분리한다. | 구현 완료 | observed weapon aggregation, member/guild DTO 분리와 테스트가 존재한다. | 유지 |

## 7. Discord 빠른 실행·운영 자동화

| ID | 확정 개발 의도 | 현재 상태 | 현재 증거와 gap | 배포 단위 |
|---|---|---|---|---|
| DSC-01 | 앱이 source of truth이고 Discord는 같은 command를 실행하는 빠른 Adapter다. 단건 일상 업무는 Discord 안에서 끝낸다. | 구현 완료 | command tree가 앱의 기존 domain command를 호출하고 migration 336의 환전 point hold 및 migration 340의 이벤트 참가 취소 RPC까지 웹과 같은 불변식을 사용한다. 승인·복구처럼 넓은 검토가 필요한 업무만 웹 deep link로 남긴다. | B |
| DSC-02 | 금전·파괴적 단건 action은 Discord에서 만료되는 최종 확인과 idempotency를 사용한다. | 구현 완료 | application command confirmations와 replay-safe RPC가 존재한다. | 배포됨 |
| DSC-03 | 길드 전체·개인 결과·운영진 행동·digest를 분리하고 같은 원본/수신자/전달 종류를 중복 발송하지 않는다. | 구현 완료 | migration 339가 관리자 알림과 domain outbox에 원자 claim·lease·재시도 backoff를 적용하고 stable Discord nonce로 재전송 중복을 막는다. 처리 완료는 claim token을 가진 worker만 확정한다. | B |
| OPS-01 | 운영진 업무함과 회원 업무함은 같은 원본 snapshot에서 행동 필요·대기·이력을 분리하고 count/deep link가 일치한다. | 구현 완료 | migrations 354·356이 원본 도메인 상태에서 회원·운영진 snapshot을 읽기 전용으로 정규화한다. 회원 홈·상태 chip·업무함과 관리자 홈·승인 count·sidebar badge·Discord digest가 각각 같은 snapshot과 중앙 deep link를 사용하며 범용 승인 mutation은 만들지 않는다. | C |
| OPS-02 | 운영 변경 기록은 중요한 mutation과 함께 commit되며 조회·탐색·pageview는 수집하지 않는다. | 부분 구현 | allowlist audit log는 있으나 다수 action이 mutation 후 best-effort 기록을 남긴다. | C |
| OPS-03 | 서비스 운영은 read-only 기본, 대리 조회는 mutation 불가, 예외 복구는 preview·사유·재확인·idempotency·필수 기록을 사용한다. | 구현 완료 | support-view 서명 쿠키를 Proxy와 공통 mutation guard에서 이중 차단하고 종료·로그아웃만 허용한다. raw POST 진단을 제거했으며 recovery command의 preview·재확인·원자적 감사 계약을 유지한다. | C |
| NTC-01 | 전역 시스템 공지는 장애·점검·보안 용도이며 활성 1개, 만료 필수, critical만 닫기 불가다. | 구현 완료 | migration 349가 목적·중요도·필수 만료·단일 open·원자적 교체/종료+감사를 강제한다. important만 사용자별 dismiss, critical은 만료 전 고정하며 캐시 뒤에서도 만료를 재검사한다. | C |
| NTC-02 | 기능별 운영 안내는 이벤트·리기어·상점의 반복 규칙만 해당 길드·페이지에 고정하고 외부 방송에 쓰지 않는다. | 구현 완료 | 기존 길드별 이벤트·리기어·상점 안내를 해당 원본 화면에만 유지하고, 설정·이미지 mutation과 표시를 중앙 feature state에 연결했다. 전역 시스템 공지나 외부 Discord 방송으로 승격하는 경로는 없다. | C |
| TAC-01 | 전술은 기본 비활성 실험 기능이며 공유는 만료·폐기 가능한 비공개 read-only 링크다. 제품이 전술 정확성을 보증하지 않는다. | 구현 완료 | migration 341과 공통 resolver가 신규 길드를 fail-closed 처리하고 기존 사용자만 명시 백필한다. nav·route·action·이벤트 연동·공유 조회가 같은 setting을 따르며 링크는 7일 만료, 원자 발급, 폐기, noindex/no-referrer를 사용한다. 기능 OFF 시 활성 링크는 영구 폐기되고 문서·스냅샷은 보존된다. | B |

## 8. 공개 사용자용 비전투로그 가치

| ID | 확정 개발 의도 | 현재 상태 | 현재 증거와 gap | 배포 단위 |
|---|---|---|---|---|
| PUB-01 | 공개 길드 프로필은 홍보·모집이 주목적이고 통계는 보조다. 모집 마감에도 페이지는 유지하되 가입 CTA만 숨기며 실제 지원은 Discord로 보낸다. | 구현 완료 | 공개 profile/settings/safe defaults가 모집 상태별 CTA와 검증된 Discord 초대를 사용한다. 모집 마감은 프로필을 보존하고 CTA만 숨기며, 기능 비활성·tenant 정지·대표권 분쟁은 본문·metadata·cache 경계에서 동일하게 fail-closed 처리한다. 공개 길드 디렉터리는 모집을 명시한 길드의 서버·시간·언어·역할 allowlist만 노출하고 회원·Discord/Albion 식별자·포인트·리기어·재정은 포함하지 않는다. | C |
| PUB-02 | 회원 공개 활동 링크는 본인 opt-in, unlisted/noindex, aggregate-only, 폐기·재발급 가능하며 로컬 계정도 확인 캐릭터로 사용할 수 있다. | 구현 완료 | 공개 활동은 폐기·재발급 가능한 token route, noindex/no-referrer, aggregate allowlist DTO를 사용한다. Discord와 로컬 계정 모두 현재 길드의 신뢰된 캐릭터만 연결할 수 있고 운영 메모·포인트·리기어·증빙·준수 정보는 DTO에 포함하지 않는다. | C |
| PUB-03 | 로그인 없는 데모는 격리된 브라우저 세션에서 대표 흐름의 상태 변화를 끝까지 체험하고 초기화할 수 있다. | 구현 완료 | `/demo`에 이벤트 신청→실제 참가 확정→리기어 신청·승인→완제품 전달→수령의 브라우저 전용 상태 여정을 추가했다. 서버·쿠키·스토리지를 쓰지 않고 초기화·새로고침으로 즉시 원상 복귀하며 모바일 브라우저에서 전 단계 전이를 검증했다. | C |
| PUB-04 | 공개 제품 문서는 현재 계약을 네 언어로 설명하고, 기존 사용자는 공개 페이지에서 바로 자기 길드로 갈 수 있다. | 구현 완료 | `/docs/current-contract`가 실제 identity·event·regear·보급·경제·업무함·Menhera·언어/시간대와 4단계 feature state를 ko/ja/en/zh로 설명한다. 데모·길드 디렉터리·내 길드 CTA와 locale canonical/hreflang을 제공하고, 세부 운영 문서는 한국어 중심임을 명시한다. | C |
| PUB-05 | 미완성 서사형 랜딩은 숨기고, 실제 운영 루프·접근성·4 locale 기준을 충족한 뒤 기존 canonical 랜딩을 대체한다. | 제거하거나 축소하기로 결정 | `/world-prototype`는 noindex로 격리돼 있다. 승격 전까지 별도 공개 제품으로 홍보하지 않는다. | C |
| PUB-06 | 현재는 종료일 없는 무료 베타이며 유료 전환 시점·가격·포함 기능을 확정하지 않는다. | 구현 완료 | 가격/FAQ가 무료 베타와 미정 상태를 표시하고 billing gate가 없다. | 유지 |
| SEO-01 | 안정 공개 표면과 opt-in 길드 프로필만 색인하고 개인 결과/공유 링크는 noindex한다. 비식별 공개 가치 이용과 길드 도입 전환을 분리 측정한다. | 부분 구현 | public metadata/attribution은 있으나 모든 token/share route와 canonical 정책을 다시 검증해야 한다. | C |

## 9. 전체 UX·설정·개인정보·i18n

| ID | 확정 개발 의도 | 현재 상태 | 현재 증거와 gap | 배포 단위 |
|---|---|---|---|---|
| FTR-01 | 기능 상태는 `setup_required/enabled/draining/disabled`로 관리하고 nav·route·action·queue·notification·cron에 동일 적용한다. | 구현 완료 | migrations 350·353·355와 중앙 catalog/resolver가 dependency, self-serve 설정, intake 차단, 기존 업무 draining, legacy projection을 원자적으로 관리한다. 웹 nav·직접 route/action·Discord·queue·notification·cron이 같은 use contract를 사용한다. | C |
| HOME-01 | 로그인 직후 활성 길드·역할별 임박 이벤트, 행동 필요 업무, 운영 차단 문제만 우선하며 같은 원본을 중복 노출하지 않는다. | 부분 구현 | 회원 홈·상태 chip은 migration 354 snapshot의 최우선 행동과 기능 상태를 공유하고, 관리자 홈은 migration 356의 단일 업무 snapshot을 사용한다. 게스트·연합 문맥과 전체 홈 browser 회귀를 최종 검증해야 한다. | C |
| INBOX-01 | 회원 업무함은 본인 행동 필요, 길드 처리 대기, 완료 이력을 분리하고 원본 module과 항상 같은 상태다. | 구현 완료 | migration 354가 리기어·환전·기부·상점·회원 거래·제작·금고 입금을 `action_required/waiting_on_guild/history`로 정규화한다. `/me/requests`는 완료 이력을 접고 필터하며 원본 module deep link와 기존 command만 사용한다. | C |
| PRIV-01 | 포인트·리기어·증빙·준수·운영 메모는 본인과 업무 권한자만 보며 공개/일반 명부 DTO에는 포함하지 않는다. | 부분 구현 | server DTO 분리와 privacy tests가 있고 공개 길드 디렉터리도 별도 allowlist DTO와 fail-closed loader를 사용해 모바일 브라우저에서 내부 UUID·원시 번역 키 미노출을 확인했다. stable member read cutover와 전체 직접 URL browser smoke는 최종 감사에 남았다. | C |
| I18N-01 | ko/ja/en/zh key·placeholder가 동등하고 사용자 노출 하드코딩이 없다. | 구현 완료 | 자동 parity/hardcoded UI tests와 CI가 존재한다. 현재 네 locale 모두 9,158개 비-superAdmin 키와 placeholder가 일치하며 공개 데모·길드 탐색·현재 제품 계약도 네 언어 경로를 제공한다. | 지속 |
| UX-01 | disabled/setup/draining 상태, 빈 상태, 다음 action, 직접 URL과 Discord handoff가 모바일·데스크톱에서 일관된다. | 부분 구현 | 중앙 feature catalog, 공통 상태 화면, 회원·운영진 snapshot과 원본 deep link를 구현했다. 공개 데모 전 단계, 길드 탐색 빈 상태·필터, 네 언어 제품 문서는 모바일 상호작용 검증을 마쳤고 최종 전체 모바일/데스크톱 browser smoke만 남았다. | C |

## 10. 최종 감사 계약

| ID | 확정 개발 의도 | 현재 상태 | 현재 증거와 gap | 배포 단위 |
|---|---|---|---|---|
| SEC-01 | 모든 mutation은 live tenant membership/capability를 서버에서 다시 확인하고 tenant ID 위조를 차단한다. | 부분 구현 | 공통 auth guard와 통합 테스트가 있으나 impersonation·legacy RPC·새 read cutover 전체 감사를 해야 한다. | C |
| SEC-02 | anon/authenticated는 내부 업무 테이블·service-role RPC를 직접 실행할 수 없다. | 부분 구현 | 최근 migration은 revoke/RLS를 포함하고 migration 342가 Release B 내부 trigger 함수의 service-role 직접 실행까지 제거한다. 기존 RLS 비활성 테이블과 전체 schema 감사는 남았다. | C |
| PERF-01 | 공용·업무 화면은 중복 전 길드 query와 불필요한 큰 payload를 피하고 캐시가 개인정보 경계를 넘지 않는다. | 부분 구현 | 이전 성능 최적화와 smoke가 있으나 다중 길드/read cutover 이후 재측정해야 한다. | C |
| OPS-04 | 운영 health·dependency·로그·migration drift가 배포 단위별로 검증되고 데이터 손실 rollback을 사용하지 않는다. | 구현 완료 | CI, `/api/health`, `/api/health/dependencies`, safe DB push, forward migration 규칙이 확립돼 있다. | 지속 |

## 우선순위 실행 백로그

우선순위는 사용자 가치, 데이터 안전성, 후속 기능이 의존하는 정도 순으로
정한다. 하나의 ID만 고치는 대신 같은 사용자가 처음부터 끝까지 거치는 흐름을
한 묶음으로 완성한다.

### 배포 단위 A — 회원 기반과 이벤트·리기어 경계

1. `MEM-01~08`: Phase 2B stable-member read adapter, 다중 길드 선택/전환,
   재가입·로컬 병합·캐릭터 이전·길드 표시명.
2. `LEG-01`: 체험/부재 신규 사용을 제거하고 운영 잔존 데이터 감사 결과에
   따라 보존형 contract migration을 분리한다.
3. `ONB-01~03`: 필수 onboarding gate와 홈 길드 dispute의 안전한 최소 모델.
4. `EVT-01~11`: gather 기반 시작, 종료 불변식, 객관적 closeout으로 통합,
   AAR 쓰기·노출 제거, 로그인 없는 게스트 신청과 개인 관리 링크를 완성한다.
5. `RGR-01~06`: 실제 참가 closeout을 신규 event regear의 단일 자격
   경계로 사용하고 게스트 opt-in/manual-death 정책까지 재검증한다.

### 배포 단위 B — 보급·경제·Menhera·Discord

1. `SUP-01~05`, `SHOP-02~03`: 제작 이행 root와 완제품 movement/수령/정산
   원자성, 가격 snapshot.
2. `ECO-01~07`: 환전 hold→payout, 금고 원본 allocation, 특별 보상,
   사이펀 모드, 루팅 총량, 월말 정산 신규 사용 차단.
3. `ACH-01~03`: achievement owner를 stable member에 연결하고 legacy AAR/MVP
   평가를 제거한다.
4. `DSC-01~03`, `TAC-01`: 핵심 단건 command parity, 알림 dedupe,
   전술 experimental/expiring share 경계.

### 배포 단위 C — 공개 가치와 제품 전반의 일관성

1. `FTR-01`: feature catalog를 먼저 도입하고 모든 surface를 같은 resolver로
   전환한다.
2. `LANG-01`, `OPS-01~03`, `NTC-01~02`: 언어, 업무함, 기록, 서비스 운영
   경계를 통합한다. `LIFE-01~02`는 배포 단위 A에서 먼저 완성·검증한다.
3. `PUB-01~06`, `SEO-01`: 공개 프로필·활동 링크·상태형 데모·문서·서사형
   canonical landing을 비전투로그 가치로 완성한다.
4. `HOME-01`, `INBOX-01`, `PRIV-01`, `UX-01`: 역할별 다음 action과
   개인정보/설정/i18n 일관성을 닫는다.
5. `SEC-01~02`, `PERF-01`, `OPS-04`: 전체 회귀·성능·보안·운영 검증.

## 의존성

```text
안정 회원 기록 read cutover
  ├─ 다중 길드·재가입·길드 표시명
  ├─ 업적 소유권·회원 공개 활동
  └─ 회원 명부·개인정보 경계

이벤트 gather 기반 시작·불변 snapshot
  ├─ 실제 참가 closeout
  ├─ 리기어 유효 정책
  └─ 참여 보상·제작·루팅 마감 상태

application command / 원자적 원장
  ├─ 제작 전달·완제품 재고
  ├─ 상점·환전·입금·포인트 양도
  └─ Discord 빠른 실행·중복 억제

feature catalog
  ├─ nav·route·action·queue
  ├─ notification·cron
  └─ 공개 문서·홈·업무함
```
