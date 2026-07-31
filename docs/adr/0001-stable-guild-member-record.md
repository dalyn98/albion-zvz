# ADR 0001: 길드 회원 기록을 업무 이력의 영속 식별자로 사용한다

- 상태: Accepted
- 날짜: 2026-07-30

## Context

현재 여러 업무 테이블은 Discord ID를 사실상 회원 식별자로 사용한다. 그러나 제품의 확정된 운영 규칙은 다음과 같다.

- 하나의 Discord 사용자는 여러 길드 워크스페이스에 참여할 수 있다.
- 같은 Discord 사용자가 길드마다 서로 다른 Albion 캐릭터를 사용할 수 있다.
- Discord 없이 로컬 길드 계정으로 시작할 수 있다.
- 로컬 계정은 나중에 Discord 신원과 병합되어도 기존 활동·보상 이력을 유지해야 한다.
- 하나의 Albion 캐릭터는 동시에 한 길드에만 활성 연결되어야 한다.
- 캐릭터 길드 이전은 과거 길드의 기록이나 포인트를 새 길드로 옮기지 않는다.

Discord ID, 로컬 계정 ID, Albion 캐릭터 ID 중 어느 하나도 이 규칙 전체를 만족하는 안정적인 업무 주체가 아니다.

## Decision

길드마다 `guild_member_records.id`라는 안정적인 UUID를 만든다.

- 이벤트, 보급, 포인트, 정산, 권한, 운영 변경 기록의 소유자는 최종적으로 이 UUID를 참조한다.
- Discord와 로컬 계정은 `guild_member_access_identities`를 통해 길드 회원 기록에 연결되는 접근 신원이다.
- Albion 캐릭터는 `guild_character_memberships`를 통해 기간을 가진 길드 재적 신원으로 연결한다.
- 같은 Discord 사용자는 여러 길드 회원 기록에 연결될 수 있다.
- 같은 Albion 캐릭터의 활성 길드 연결은 DB partial unique index로 하나만 허용한다.
- 회원 계정 병합은 접근 신원을 같은 길드 회원 기록에 귀속하는 작업이다.
- 캐릭터 길드 이전은 과거 membership을 종료하고 새 membership을 시작하는 작업이다.
- 기존 `discord_id` 기반 schema는 expand/contract 전환 기간에만 dual-write 호환층으로 유지한다.

## Alternatives considered

### Discord ID를 계속 회원 식별자로 사용

초기 변경은 작지만 로컬 계정에 synthetic ID가 필요하고, 병합 때 많은 이력 행을 다시 써야 한다. 같은 Discord 사용자의 여러 길드 관계와 게임 캐릭터 이전도 접근 신원과 업무 주체가 계속 섞인다.

### 전역 사용자 계정을 하나 만들고 모든 길드 기록을 그 계정에 귀속

여러 길드 접근은 단순해지지만 테넌트별 회원 상태·권한·잔액이 전역 사용자에 결합된다. 길드 탈퇴와 캐릭터 이전 때 경계가 흐려지고, 필요 이상의 전역 신원 결합을 만든다.

### 모든 기존 테이블을 한 번에 UUID로 변경

최종 schema에는 빨리 도달하지만 영향 범위가 매우 크다. 데이터 backfill·RLS·RPC·JSON snapshot·Discord Adapter가 동시에 바뀌어 안전한 rollback이 어렵다.

## Consequences

긍정적 결과:

- 로그인 방법이 바뀌어도 업무 이력의 주체가 변하지 않는다.
- 로컬→Discord 병합이 대량 이력 재작성보다 신원 연결 변경에 가까워진다.
- 길드 간 기록 격리와 캐릭터 이전 의미가 schema에 드러난다.
- 권한·포인트·보급 같은 Module이 인증 제공자 세부사항을 모르게 된다.

비용:

- 전환 기간에 `guild_member_id`와 기존 `discord_id`를 함께 관리해야 한다.
- backfill, compatibility read, shadow 검증이 필요하다.
- 기존 RPC와 RLS를 단계적으로 갱신해야 한다.

위험 완화:

- additive migration과 dual-write를 먼저 적용한다.
- 소유권이 중요한 도메인부터 순서대로 read cutover한다.
- 두 번 이상의 안정 배포 전에는 legacy 컬럼이나 index를 삭제하지 않는다.
- 각 단계에 tenant 격리·동시성·병합 보존 통합 테스트를 둔다.

## Follow-up

구현 순서와 완료 기준은 `docs/guild-operating-model-final-design.md`를 따른다.

Phase 2A에서 이 결정을 다음과 같이 검증하고 수용했다.

- `315_guild_member_record_schema.sql`에서 안정 회원 기록, 접근 신원, 기간형 캐릭터 재적과 미해결 신원 충돌 진단을 additive하게 추가한다.
- 접근 신원의 자연키는 `(guild_id, identity_type, subject_id)`이며 같은 Discord 사용자의 여러 길드 참여를 허용한다.
- 캐릭터 활성 연결의 자연키는 변경 가능한 닉네임이 아니라 `(albion_server, albion_player_id)`이고, `ended_at is null`인 행에 전역 partial unique를 둔다.
- `316_guild_member_record_backfill.sql`은 근거가 하나로 수렴하는 행만 결정적으로 백필하고, 여러 활성 회원 기록을 가리키는 캐릭터·서로 다른 회원 기록에 이미 귀속된 접근 신원은 자동 병합하지 않는다.
- `317_guild_member_record_dual_write.sql`은 Discord 가입·동일 길드 재가입·로컬 계정·Albion 연결과 기존 지원 계정 병합을 새 모델에 dual-write한다.
- Phase 2A에서는 기존 포인트·리기어·이벤트·거래·제작 소유권과 Discord 기반 read path를 변경하지 않는다. 업무 테이블의 `guild_member_id` read cutover와 로컬→Discord 자동 병합 UX는 후속 단계로 남긴다.

Release A의 Phase 2B 첫 cutover는 다음 범위로 제한한다.

- `321_stable_member_read_cutover.sql`이 슬롯 신청·배정, 이벤트 참가예정·마감 명단, 이벤트 리기어 참가자와 리기어 신청에 nullable `guild_member_id`를 추가한다. 게스트와 미해결 신원은 합리적인 `NULL`로 남기고 기존 Discord 접촉 컬럼은 삭제하지 않는다.
- `(guild_id, guild_member_id)` 복합 FK와 write projection trigger가 테넌트 혼입 및 명시적 신원 불일치를 차단한다.
- `guild_member_directory_v1`은 안정 회원 한 명당 한 행만 반환하고 `길드별 운영진 지정명 → 활성 Albion 캐릭터명 → 가입 시 snapshot → Discord 표시명` 순서로 표시 이름을 결정한다. 원시 접근 신원은 계속 service role 경계 안에 둔다.
- 길드별 표시명 수정은 감사 기록과 같은 transaction에서 실행하며, Discord 서버 닉네임 변경은 별도의 명시적 best-effort 작업으로 둔다.
- 다중 길드 전환은 활성 접근 신원만 후보로 보여주고, 전환 시 대상 Discord 길드의 실시간 회원·역할을 다시 확인한 뒤 짧은 수명의 브라우저 결합 hop으로 새 tenant 세션을 발급한다.
- `323_verified_character_membership_transfer.sql`은 새 길드의 `home_guild + trusted` 공식 증거가 account-link trigger에서 확인된 경우에만 이전 캐릭터 재적 종료와 새 재적 시작을 한 transaction에서 수행한다. 이전 길드 회원은 비활성화하지만 포인트·이벤트·리기어 등 기존 업무 소유권은 재작성하지 않는다.
- Discord 서버 닉네임은 최초 신뢰 연결, 실제 Albion 캐릭터명 변경, 운영진 명시 적용에만 best-effort로 갱신하며 이름이 같은 일반 refresh는 사용자의 Discord 변경을 덮지 않는다.
- 포인트·상점·재정·제작 소유권의 UUID cutover와 legacy 컬럼 제거는 이 단계에 포함하지 않는다.
