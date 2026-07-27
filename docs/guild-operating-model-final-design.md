# 길드 운영 모델 최종 설계

- 상태: 구현 가능한 제안
- 작성일: 2026-07-24
- 범위: 보급 흐름, 회원 거래, 길드 상점, 포인트→실버 환전, 실버→포인트 적립, 포인트 양도, 이벤트 특별 보상, 회원 신원, 기능 선택 사용, 오늘의 업무함, 운영 변경 기록
- 제외: 전투로그·전투 집계·공개 전투 탐색의 상세 설계

## 1. 목표

이 설계의 목표는 기능 수를 늘리는 것이 아니라, 현재 기능들이 같은 운영 원칙 아래에서 끝까지 이어지게 만드는 것이다.

최종 상태는 다음 질문에 모두 한 곳에서 답할 수 있어야 한다.

1. 이 길드에서 이 사람은 누구인가?
2. 이 길드가 실제로 사용하는 기능은 무엇인가?
3. 운영진이 지금 처리해야 할 일은 무엇인가?
4. 한 보급 요청은 지금 어느 단계이며 무엇이 실제로 지급됐는가?
5. 중요한 운영 상태를 누가, 왜, 어떻게 바꿨는가?

### 현재 코드에서 확인한 핵심 gap

| 축 | 현재 구조의 한계 |
|---|---|
| 보급 | `src/app/actions/craft-queue.ts`가 제작 전달을 먼저 확정한 뒤 재고를 best-effort로 차감한다. |
| 환전 | `exchange_requests`는 포인트 hold 없이 `pending`이 되고, 운영진의 `approve_exchange_request`가 정책 승인·실버 지급 완료·포인트 차감을 한 상태로 합친다. |
| 입금 적립 | `donation_requests`는 회원 주장 금액과 스크린샷만 받아 모든 건을 운영진이 심사하며, 확인 가능한 금고 실버 입금 원본과 연결하지 않는다. |
| 포인트 양도 | 현재 원장 이동은 원자적이지만 별도 양도 batch와 idempotency key가 없어 동일 요청 재전송을 같은 양도로 식별할 수 없고, 회원 거래와의 제품 경계도 명시적이지 않다. |
| 이벤트 특별 보상 | `event_payout_requests`는 생성과 승인을 나누지만 둘 다 `EVENT_MANAGE` 권한을 사용하고 동일인이 자신의 요청을 승인할 수 있어 실질적인 상호 검증이 아니다. 특별한 경우의 지급인데도 모든 건이 `pending` 승인 업무를 만든다. |
| 신원 | 현재 병합 RPC는 숫자 Discord ID를 전제로 해 `local:<uuid>`를 직접 병합할 수 없고, 캐릭터 단일 활성 길드는 DB 제약이 아니다. |
| 기능 | `AppShell`·`AppSidebar`·직접 route·action·알림이 기능 가용성을 각자 판단한다. |
| 업무함 | queue key·count·oldest·권한·deep link가 badge, 대시보드, 승인 tab, 알림에 중복돼 있다. |
| 기록 | 중요 변경 뒤 별도 best-effort 기록을 남겨 mutation과 기록이 함께 commit된다는 보장이 없다. |

## 2. 확정 불변식

| 영역 | 불변식 |
|---|---|
| 테넌트 | 모든 업무 데이터는 `guild_id`로 격리한다. |
| 회원 | 하나의 Discord 사용자는 여러 길드 워크스페이스를 가질 수 있다. |
| 회원 | 같은 Discord 사용자라도 길드마다 서로 다른 길드 회원 기록을 갖는다. |
| 회원 | 길드 회원 기록이 활동·보상·권한·상태 이력의 주체다. 로그인 수단은 그 기록에 연결된다. |
| 캐릭터 | 하나의 Albion 캐릭터는 동시에 최대 한 길드에만 활성 연결된다. |
| 병합 | 로컬 계정과 Discord 접근 신원을 합쳐도 기존 길드 회원 기록과 이력은 유지한다. |
| 이전 | 캐릭터가 길드를 옮겨도 이전 길드의 활동·포인트·정산 기록은 이동하지 않는다. |
| 기능 | 완전히 꺼진 기능은 내비게이션뿐 아니라 직접 경로, 업무함, 알림, 자동화에서도 동작하지 않는다. 미처리 업무가 있으면 먼저 draining 상태로 전환한다. |
| 보급 | 상태 변경, 재고 변경, 지급 원장, 중요 변경 기록은 한 트랜잭션에서 함께 성공하거나 함께 실패한다. |
| 보급 | 리기어가 없는 이벤트도 정상 완료 상태다. |
| 업무함 | 업무함은 승인·예외·후속 조치만 모으며 상태 통계나 전체 기록을 섞지 않는다. |
| 기록 | 화면 조회와 일반 탐색은 운영 변경 기록에 남기지 않는다. |
| 채널 | 앱이 운영 원본이며 Discord는 로그인·공지·빠른 행동을 위한 Adapter다. |
| 도입 | 새 길드는 봇 초대와 웹 설정만으로 기존 길드와 같은 상태에 도달할 수 있어야 한다. |
| 회원 거래 | 회원 거래장은 같은 길드 포인트를 에스크로로 사용하지만 주문·분쟁 기록은 길드 상점·기부 정책 및 길드 재정과 분리한다. |
| 길드 상점 | 일반 주문은 재고·포인트를 원자적으로 예약해 자동 접수하고 운영진은 실제 전달만 처리한다. |
| 환전 | 정상 포인트→실버 환전은 포인트를 원자적으로 보류해 자동 접수하고 운영진은 실제 인게임 지급만 처리한다. |
| 입금 적립 | 금고 로그는 입금 사실만 증명하고 회원의 명시적 용도 지정이 포인트 적립 의사를 증명하며, 정확히 연결된 건만 자동 적립한다. |
| 포인트 양도 | 양도는 취소·분쟁 보호가 없는 즉시 선물·개인 정산이며 물품 거래는 회원 거래장의 에스크로를 사용한다. |
| 이벤트 특별 보상 | 종료된 이벤트의 예외적 기여·운영 사유에만 지급하며, 전용 권한을 가진 운영진의 한 번의 강한 최종 확인으로 원장을 원자적으로 생성한다. 정기 참가 보상이나 별도 승인 queue로 사용하지 않는다. |

## 3. 목표 구조

```text
웹 UI ───────┐
Discord ─────┼─ Adapter ──> Application Command / Query Interface
cron·worker ─┘                         │
                                      ▼
       ┌────────────────────────────────────────────────┐
       │ 회원 신원 │ 기능 가용성 │ 오늘의 업무함       │
       │ 보급 흐름 │ 길드 상점 │ 회원 거래 │ 입출금  │
       │ 운영 변경 기록                                │
       └────────────────────────────────────────────────┘
                                      │
                                      ▼
                   Postgres transaction + outbox
                                      │
                        알림·Discord·후속 worker
```

화면이나 Discord 명령이 데이터 갱신 순서를 직접 알지 않게 한다. 각 Module은 작은 Interface 뒤에 여러 상태 변경 규칙을 숨긴다. 웹·Discord·cron은 같은 Interface를 호출하는 Adapter이며, Postgres 함수가 중요한 변경의 원자성을 보장하는 Implementation이다.

공통 명령 문맥은 다음 정보를 가진다.

```ts
interface CommandContext {
  guildId: string
  actorMemberId: string | null
  actorIdentity: {
    kind: 'discord' | 'local' | 'system'
    subjectId: string
  }
  source: 'web' | 'discord' | 'cron' | 'support'
  correlationId: string
  idempotencyKey: string
}
```

- `correlationId`: 한 사용자 행동과 후속 알림을 연결한다.
- `idempotencyKey`: 중복 클릭, Discord 재시도, worker 재실행을 한 번의 명령으로 만든다.
- `source=support`: 예외 지원용이며 정상 운영의 우회 경로로 사용하지 않는다.

## 4. 회원 신원 Module

### 4.1 책임

회원 신원 Module은 “로그인한 주체가 이 길드의 어떤 길드 회원 기록인가”만 책임진다. 포인트, 이벤트, 리기어 같은 다른 Module은 Discord ID나 로컬 계정 ID를 직접 소유자로 사용하지 않는다.

### 4.2 데이터 모델

#### `guild_member_records`

길드 안에서 변하지 않는 회원 주체다.

| 필드 | 의미 |
|---|---|
| `id` | UUID, 다른 업무 테이블이 참조할 영속 식별자 |
| `guild_id` | 길드 워크스페이스 |
| `status` | `active`, `withdrawn`, `suspended` |
| `display_name` | 현재 표시명 |
| `joined_at`, `withdrawn_at` | 길드 범위 재적 이력 |
| `created_at`, `updated_at` | 관리 시각 |

#### `guild_member_access_identities`

한 길드 회원 기록에 접근 수단을 연결한다.

| 필드 | 의미 |
|---|---|
| `guild_member_id` | 길드 회원 기록 |
| `guild_id` | RLS·검증용 중복 테넌트 키 |
| `identity_kind` | `discord`, `local` |
| `subject_id` | Discord 사용자 ID 또는 로컬 계정 ID |
| `status` | `active`, `revoked` |
| `linked_at`, `revoked_at` | 접근 이력 |

제약:

- `unique(guild_id, identity_kind, subject_id)`로 한 접근 신원이 같은 길드의 두 회원 기록에 동시에 붙지 않게 한다.
- 같은 Discord `subject_id`는 다른 `guild_id`에서 다시 사용 가능하다.
- 로컬 비밀번호 hash는 이 테이블이 아니라 기존 로컬 자격 증명 저장소에 둔다.

#### `albion_characters`

게임 캐릭터의 전역 식별 정보다.

| 필드 | 의미 |
|---|---|
| `id` | 내부 UUID |
| `server` | Albion 서버 |
| `player_id` | API가 제공하는 안정 ID |
| `current_name` | 현재 닉네임 |
| `last_verified_at` | 마지막 API 확인 시각 |

`unique(server, player_id)`를 둔다. 닉네임 문자열은 식별자가 아니다.

#### `guild_character_memberships`

캐릭터와 길드 회원 기록의 길드 재적 이력을 보존한다.

| 필드 | 의미 |
|---|---|
| `character_id` | Albion 캐릭터 |
| `guild_member_id` | 그 기간의 길드 회원 기록 |
| `guild_id` | 길드 |
| `relation` | `home`, `alliance`, `external` |
| `trust_status` | `verified`, `unverified`, `disputed` |
| `started_at`, `ended_at` | 활성 기간 |

핵심 제약:

```sql
unique (character_id) where ended_at is null
```

이 제약이 동시에 두 길드에 같은 캐릭터가 활성화되는 경쟁 조건까지 DB에서 막는다.

### 4.3 Interface

```ts
interface GuildIdentityModule {
  resolveMember(context: AccessContext): Promise<ResolvedGuildMember>
  linkDiscordIdentity(command: LinkDiscordIdentity): Promise<LinkResult>
  mergeMemberRecords(command: MergeMemberRecords): Promise<MergeResult>
  transferCharacter(command: TransferCharacter): Promise<TransferResult>
  listAccessibleWorkspaces(discordUserId: string): Promise<WorkspaceAccess[]>
}
```

호출부는 `local:<uuid>`와 숫자 Discord ID를 구분하는 분기를 갖지 않는다.

### 4.4 로컬 계정 → Discord 연결

1. 로컬 사용자가 현재 길드에서 Discord 연결을 선택한다.
2. OAuth callback이 동일 길드의 Discord 접근 신원을 확인한다.
3. Discord 접근 신원이 아직 없으면 현재 길드 회원 기록에 추가한다.
4. 이미 다른 길드 회원 기록에 있으면 병합 후보를 계산한다.
5. 같은 검증된 Albion 캐릭터이고 충돌이 없으면 자동 병합한다.
6. 캐릭터 불일치, 분쟁 상태, 고위험 권한 충돌만 오늘의 업무함에 보낸다.
7. 활동·포인트·신청 행을 삭제하지 않는다. 최종 `guild_member_id`만 동일한 기록으로 귀속한다.
8. 병합 commit 시 로컬 credential version을 올리고 기존 로컬 session을 폐기한다. 이후 로그인은 연결한 Discord 신원을 사용한다.

운영진이 모든 연결을 승인하지 않는다. 증거가 일치하는 정상 경로는 자동 처리하고 모순만 검토한다.

### 4.5 캐릭터 길드 이전

1. 새 길드에서 캐릭터 인증을 요청한다.
2. Albion API가 새 홈 길드 관계를 확인한다.
3. 트랜잭션에서 현재 활성 `guild_character_memberships` 행을 잠근다.
4. 이전 연결의 `ended_at`을 기록하고 이전 길드 회원 기록을 `withdrawn` 처리한다.
5. 새 길드 회원 기록에 새 활성 연결을 만든다.
6. 이전 길드의 포인트·정산·이벤트·리기어 이력은 그대로 둔다.
7. 양쪽 길드에 운영 변경 기록을 남기고 필요한 알림은 outbox로 보낸다.
8. API 확인이 불가능하거나 길드 정보가 모순일 때만 `identity_conflict` 업무를 만든다.

### 4.6 여러 길드 전환 UX

- Discord 사용자는 전역 “내 길드” 화면에서 접근 가능한 워크스페이스를 본다.
- 워크스페이스 선택 시 대상 길드 host로 짧은 수명의 일회용 handoff token을 보낸다.
- 대상 host가 자체 테넌트 세션을 만든 뒤 token을 폐기한다.
- 한 화면에서 여러 길드 데이터를 합치지 않는다.
- 로컬 길드 계정에는 전환 UI를 노출하지 않는다.

### 4.7 전환 전략

기존 90개 이상의 Discord ID 참조를 한 번에 바꾸지 않는다.

1. 새 신원 테이블을 추가하고 `guild_avatars`, 로컬 계정, 기존 Albion link에서 backfill한다.
2. 중복 캐릭터 후보를 먼저 `disputed`로 격리한 뒤 활성 membership partial unique index를 만든다.
3. 기존 행에 nullable `guild_member_id`를 추가한다.
4. 신규 쓰기는 `guild_member_id`와 기존 `discord_id`를 dual-write한다.
5. 조회 결과가 같은지 shadow 검증한다.
6. 재정·보급·이벤트처럼 소유권이 중요한 영역부터 `guild_member_id` 읽기로 전환한다.
7. 모든 소비자가 전환된 뒤 기존 `discord_id` 소유권 컬럼을 호환용 projection으로만 유지한다.
8. 최소 두 번의 안정 배포 후 legacy write와 분기 코드를 제거한다.

## 5. 보급 흐름 Module

### 5.1 현재 가장 큰 위험

현재 제작 전달 흐름은 제작 작업을 `delivered`로 확정한 뒤 애플리케이션에서 재고를 best-effort로 차감한다. 두 번째 작업이 실패하면 “전달 완료지만 재고는 그대로”인 상태가 가능하다.

현재 정산 흐름도 제작자가 납품 시 `material_silver_cost`를 직접 입력한 뒤 운영진이 `pending` 건을 승인·조정·거절한다. 최종 구조에서는 이 사후 입력·건별 심사를 제거하고 작업 수락 때 고정된 조건을 박스 입고와 함께 자동 확정한다.

최종 구조에서는 보급 상태, 재고, 지급 원장, 운영 변경 기록을 Postgres의 같은 트랜잭션에서 처리한다. 알림 전송만 commit 이후 outbox에서 수행한다.

### 5.2 데이터 모델

#### `supply_fulfillments`

리기어 요청 또는 길드 제작 주문의 이행 상태를 나타낸다.

| 필드 | 의미 |
|---|---|
| `id` | 이행 ID |
| `guild_id` | 길드 |
| `source_kind`, `source_id` | `regear_request`, `guild_order` |
| `mode` | `silver`, `stock`, `craft` |
| `status` | 아래 상태 머신 |
| `material_source` | `guild_stock`, `crafter_purchase`, `not_applicable` |
| `craft_fee_mode` | `none`, `configured`, `not_applicable` |
| `material_reimbursement_silver`, `craft_fee_silver`, `settlement_total_silver` | 작업 수락 때 고정되는 정산 금액 |
| `settlement_terms_accepted_at` | 제작자가 고정 정산 조건을 수락한 시각 |
| `snapshot` | 승인 당시 빌드·수량·가격의 변경 불가 snapshot |
| `receipt_due_at`, `receipt_overdue_at` | 수령 확인 예정 시각과 지연 전환 시각 |
| `completed_at`, `returned_unclaimed_at`, `cancelled_at` | 수령 완료·미수령 회수·취소 시각 |
| `version` | 낙관적 동시성 검사용 |

상태:

```text
awaiting_decision
  ├─ silver ───────────────────────────────> completed
  ├─ stock ────────────────────────────────> completed
  └─ craft -> queued -> in_progress -> ready_for_pickup ─────> completed
                                      └─> receipt_overdue ───> completed
                                      │        └─ box moved ─> ready_for_pickup
                                      └─ unclaimed return ───> returned_unclaimed
                         receipt_overdue ── unclaimed return ─> returned_unclaimed
awaiting_decision / queued / in_progress ────────────────────> cancelled
```

리기어 신청의 `pending/approved/rejected`는 심사 상태다. `supply_fulfillments.status`는 실제 지급·제작 완료 상태다. 둘을 같은 status로 표현하지 않는다.

제작 리기어에서 `ready_for_pickup`은 **제작 리기어 박스 입고**, `completed`는 **제작 리기어 수령 완료**에 대응한다. 박스 입고는 제작자의 납품 완료일 뿐 보급 이행의 최종 완료가 아니며, 신청자가 수령을 확인해야 `completed`가 된다. 각 박스는 입고 뒤 신청자 수령, 운영진의 미수령 회수 종료 또는 이동이 확인될 때까지 점유한다.

`returned_unclaimed`는 **미수령 회수 종료**에 대응하는 종료 상태다. 운영진이 이 조치를 실행하면 반납 장비를 완제품 장부 재고에 더하고 기존 박스를 해제하며 현재 지급 건을 끝낸다. 리기어 승인 기록과 최초 입고로 발생한 제작자 정산 권리는 유지하지만 활성 재지급 상태는 만들지 않는다. 나중에 다시 지급하려면 새 `supply_fulfillment`를 명시적으로 생성한다.

**제작자 정산** 권리는 `ready_for_pickup` 전환과 동시에 발생한다. 신청자의 수령 확인은 정산의 선행 조건이 아니다. **제작 재료 조달 방식**과 **제작 수수료**는 독립적으로 저장한다.

- `guild_stock + none`: 재료비 0원, 제작 수수료 0원
- `crafter_purchase + none`: 제작자가 부담한 재료비만 정산
- `crafter_purchase + configured`: 재료비와 길드 정책의 제작 수수료 정산
- `guild_stock + configured`: 재료비 없이 제작 수수료만 정산

제작자가 작업을 가져가기 전 **제작 정산 조건**을 품목별 금액과 합계로 보여준다. `crafter_purchase`의 재료비는 승인된 리기어 snapshot에 포함된 제작 대상 품목 가격 합계로 계산하고, `guild_stock`의 재료비는 0원이다. 제작 수수료를 포함한 총액은 `claimCraft` 성공 시 고정하며 실제 원재료 구매액과 이후 시세 변동은 반영하지 않는다.

제작자는 납품할 때 재료비를 입력하지 않는다. `deliverCraft`는 수락된 고정 금액을 변경하지 않고 박스 입고와 함께 **제작 정산 확정**을 자동 기록한다. 건별 `pending → approved/rejected` 심사는 신규 작업에서 제거하며, 실제 지급 완료와 월말 정산은 이 확정과 별도다.

확정된 금액은 제작자별 미지급 실버 합계로 보여준다. 운영진은 고정 정산 주기를 설정하거나 납품 건마다 승인하지 않고, 게임 안에서 실버를 전달한 시점에 포함된 정산 항목을 한 번에 지급 완료 처리한다. 원본 항목은 합계 아래에 남겨 어떤 제작 작업이 포함됐는지 확인할 수 있게 한다.

재료 조달 방식은 제작자 정산에만 사용한다. 완제품 재고 차감 여부를 결정하지 않는다. 제작 리기어는 원재료·예약·정확한 출처를 추적하지 않고, 모든 박스 입고를 **완제품 장부 재고**에서 먼저 차감한다.

#### `guild_inventory_movements`

현재 수량만 저장하는 재고 projection과 별도로 변경 원장을 둔다.

| 필드 | 의미 |
|---|---|
| `guild_id`, `item_id` | 테넌트와 아이템 |
| `delta` | 입고 양수, 출고 음수 |
| `reason` | `baseline`, `manual_adjustment`, `stock_fulfillment`, `craft_delivery`, `unclaimed_return`, `reversal` |
| `reference_kind`, `reference_id` | 원인이 된 보급 이행·작업 |
| `line_key` | 같은 item이 여러 slot에 있을 때도 수량을 구분하는 안정 key |
| `actor_member_id` | 실행자 |
| `correlation_id` | 같은 명령·기록·알림 연결 |
| `created_at` | 변경 시각 |

제약:

- `(guild_id, reference_kind, reference_id, reason, line_key)`에 idempotency unique key를 둔다.
- `guild_inventory_gear`는 정확한 실물 원장이 아니라 **완제품 장부 재고**의 현재 수량 projection으로 유지한다.
- movement 삽입과 projection 갱신은 같은 함수·트랜잭션에서 수행한다.
- 직접 재고 출고는 재고가 부족하면 전체 명령을 실패시킨다.
- 제작 리기어 박스 입고는 조달 출처와 무관하게 품목별 현재 장부 수량을 0까지 차감한다.
- 장부 수량보다 많이 납품한 부분은 재고를 음수로 만들지 않고 **재고 외 조달**로 기록한다.
- 수동 절대 수량 재조정은 기존 movement를 수정하지 않고 `manual_reconciliation` movement로 남긴다.

#### `supply_outside_stock_fulfillments`

완제품 장부 재고로 충당하지 못한 정상 납품분을 기록한다. 오류나 운영진 처리 대기 상태가 아니다.

| 필드 | 의미 |
|---|---|
| `fulfillment_id`, `task_id` | 관련 이행과 제작 작업 |
| `item_id`, `line_key`, `quantity` | 장부 재고 밖에서 충당된 품목과 수량 |
| `material_source` | 정산을 위한 `guild_stock`, `crafter_purchase` |
| `actor_member_id`, `correlation_id` | 납품 주체와 명령 |
| `created_at` | 기록 시각 |

재고 외 조달은 박스 입고를 막지 않으며 자동으로 오늘의 업무함에 올리지 않는다. 통계와 재고 보충 판단에만 사용한다.

#### `domain_outbox`

commit 이후 실행할 알림·Discord 메시지를 저장한다.

| 필드 | 의미 |
|---|---|
| `guild_id`, `topic` | 테넌트와 알림 종류 |
| `aggregate_kind`, `aggregate_id` | 관련 업무 객체 |
| `payload` | 최소 알림 데이터 |
| `correlation_id` | 원 명령 |
| `status`, `attempts`, `available_at` | 재시도 상태 |

동일 aggregate·topic·correlation 조합은 한 번만 생성한다.

### 5.3 Interface

```ts
interface SupplyModule {
  approve(command: ApproveSupplyRequest, context: CommandContext): Promise<SupplyResult>
  claimCraft(command: ClaimCraftTask, context: CommandContext): Promise<SupplyResult>
  deliverCraft(command: DeliverCraftTask, context: CommandContext): Promise<SupplyResult>
  collect(command: CollectSupply, context: CommandContext): Promise<SupplyResult>
  closeUncollectedCraft(command: CloseUncollectedCraft, context: CommandContext): Promise<SupplyResult>
  moveCraftBox(command: MoveCraftBox, context: CommandContext): Promise<SupplyResult>
  convertToSilver(command: ConvertSupplyToSilver, context: CommandContext): Promise<SupplyResult>
  cancel(command: CancelSupply, context: CommandContext): Promise<SupplyResult>
  getCase(query: SupplyCaseQuery): Promise<SupplyCase>
}
```

각 command는 명시적인 SQL RPC Adapter로 번역한다. 범용 JSON RPC 하나로 모든 상태를 바꾸지 않는다.

### 5.4 트랜잭션 규칙

`deliverCraft` 한 번에 다음이 함께 일어난다.

1. 길드·권한·현재 상태·version을 검증한다.
2. 같은 `idempotencyKey`가 처리됐으면 기존 결과를 반환한다.
3. 필요한 재고 행을 `for update`로 잠근다.
4. 허용되지 않은 box 번호면 아무 상태도 바꾸지 않고 실패한다.
5. 품목별로 `min(장부 재고, 납품 수량)`을 차감하고 나머지를 재고 외 조달로 기록한다.
6. craft task를 박스 입고로, fulfillment를 `ready_for_pickup`으로 갱신한다.
7. inventory movement를 추가하고 현재 재고 projection을 갱신한다.
8. 작업 수락 때 고정한 재료비와 제작 수수료 합계를 별도 승인 없이 제작자 지급 예정액으로 기록한다.
9. 운영 변경 기록을 삽입한다.
10. 알림 outbox를 삽입한다.
11. 모두 성공하면 commit한다.

Discord 빠른 승인도 웹과 같은 command를 호출하므로 별도 규칙을 갖지 않는다.

신청자의 수령 확인은 별도 `collect` command로 처리한다. 이 command가 박스 점유를 해제하고 fulfillment를 `completed`로 전환한다.

확인 기한이 지나도 자동 완료하거나 박스를 해제하지 않는다.

- scheduler는 `ready_for_pickup`을 `receipt_overdue`로 바꾸고 신청자 알림과 `craft_receipt_overdue` 업무를 만든다.
- `receipt_overdue` 동안 기존 box 번호의 unique 점유를 유지한다.
- 신청자 수령 확인은 `completed`로 전환하고 **회차 박스 해제**를 수행한다.
- 운영진의 **미수령 회수 종료**는 장비를 완제품 장부 재고에 다시 더하고 박스를 해제한 뒤 fulfillment를 `returned_unclaimed`로 종결한다.
- 회수 종료는 리기어 승인 기록과 최초 입고로 확정된 제작자 정산을 되돌리지 않으며 새 업무를 자동 생성하지 않는다.
- 나중에 다시 지급할 때만 운영진이 같은 승인 기록을 근거로 새 지급 건을 만든다.
- 운영진의 박스 이동은 기존 박스를 해제하고 새 박스를 점유하며, 재고·제작자 정산은 변경하지 않는다.
- `craft_box_expiry_days`는 구현 전환 시 `craft_receipt_followup_days` 의미로 이관하고, 기존 `expired` 자동 전이는 제거한다.

### 5.5 기존 데이터 정합성 회복

과거 movement를 추정해 현재 재고를 자동 수정하지 않는다.

1. 현재 재고를 `baseline` movement로 기록한다.
2. 이미 전달된 craft task와 현재 재고의 잠재 불일치를 읽기 전용 보고서로 만든다.
3. 확실한 건만 idempotent repair command로 보정한다.
4. 모호한 건은 `supply_attention` 업무로 보낸다.
5. 기준 시각 이후 신규 변경만 movement 합계와 현재 재고가 항상 같도록 강제한다.

## 6. 회원 거래 Module

### 6.1 경계

회원 거래장은 길드 상점이 아니다. 판매 물품은 회원 소유이고 앱은 아이템을 보관하거나 게임 내 전달을 검증하지 않는다. 다만 구매자의 길드 포인트를 **회원 거래 에스크로**로 보류하고 주문 상태에 따라 회원 사이에서 이전하거나 구매자에게 돌려준다.

- 회원 거래 주문·가격 제안·에스크로·분쟁 기록은 전용 원장에 둔다.
- 사용 가능 포인트 계산과 최종 회원 간 이전은 공통 길드 포인트 원장을 사용한다.
- 거래 금액은 길드 재정의 수입·지출로 잡지 않는다.
- 가격 제안만으로는 포인트를 보류하지 않고 판매자가 수락해 주문이 생길 때 다시 잔액·재고를 검증한다.

### 6.2 주문 상태

```text
active listing / accepted offer
  └─> awaiting_delivery + escrow held
        ├─ cancel or delivery timeout ───────────────> cancelled + escrow refunded
        └─ seller marks delivered ──────────────────> delivered
              ├─ buyer confirms receipt ────────────> completed + escrow released
              ├─ 72h without response ──────────────> completed + escrow auto-released
              └─ buyer opens dispute ───────────────> disputed
                    ├─ operator releases all ────────> completed
                    └─ operator refunds all ─────────> refunded
```

판매자의 전달 완료는 실제 아이템 전달에 대한 자기 신고이며 거래 완료가 아니다. 이 시점에 `confirmation_due_at = delivered_at + 72 hours`를 고정하고 구매자에게 수령 확인과 분쟁 제기 방법을 알린다.

구매자가 **거래 수령 확인 기한** 안에 아무 행동도 하지 않으면 scheduler가 **무응답 자동 지급**을 수행한다. `delivered` 상태와 보류 중인 에스크로를 같은 트랜잭션에서 잠그고 구매자 차감·판매자 적립·에스크로 해제·주문 완료·거래 사건·운영 변경 기록을 함께 반영한다. 알림은 commit 이후 outbox에서 전송한다.

구매자가 기한 안에 **회원 거래 분쟁**을 열면 자동 지급 대상에서 즉시 제외한다. 분쟁은 오늘의 업무함에 표시하고 운영진은 사유를 기록한 뒤 `release_all` 또는 `refund_all`만 선택한다. 부분 지급, 자동 판정, 기한 경과에 따른 분쟁 강제 종결은 지원하지 않는다.

72시간은 첫 구현의 고정 정책으로 두고 길드별 설정을 추가하지 않는다. 기능이나 알림이 일시 중단돼도 이미 생성된 주문의 에스크로 해소 scheduler는 `draining` 처리로 계속 동작한다.

## 7. 길드 상점 Module

### 7.1 주문 구분

현재 코드는 모든 주문을 `pending`으로 만들고 재고만 먼저 예약한다. 포인트는 보류하지 않은 채 운영진 승인 시 다시 잔액을 검사하므로, 정상 카탈로그 주문도 관리자가 처리해야 하고 여러 대기 주문이 같은 포인트를 중복 사용하려는 상태가 생길 수 있다. 또한 `approve_shop_order`의 `p_total_points_override`는 운영진이 신청 금액을 바꾸면서 바로 차감할 수 있어, 인상된 가격에 대한 회원의 추가 동의가 없다.

최종 구조는 주문을 둘로 나눈다.

- **일반 상점 주문**: 카탈로그 가격·재고·포인트를 서버가 확정할 수 있어 자동 접수한다.
- **가격 검토 주문**: 회원 제시 가격·특수 아이템처럼 자동 가격을 신뢰할 수 없어 운영진이 가격만 검토한다.

가격 검토 주문은 드문 예외가 아니라 자주 발생하는 정상 경로로 취급한다. 일반 주문은 관리자 승인 queue에 들어가지 않는다. 운영진에게 필요한 행동은 예약된 물품의 실제 준비와 **상점 전달 완료**뿐이다.

### 7.2 주문 상태와 예약

```text
catalog order submit
  └─> ready_for_fulfillment + stock reserved + points held
        ├─ member cancels before delivery ───────────> cancelled + reservations released
        └─ operator delivers ────────────────────────> completed + point debit committed

price-review order submit
  └─> pending_review + stock reserved + submitted points held
        ├─ rejected or member cancels ───────────────> cancelled + reservations released
        ├─ final price <= submitted price ───────────> ready_for_fulfillment
        │                                               + excess hold released
        └─ final price > submitted price ────────────> awaiting_member_confirmation
                                                        ├─ member accepts + extra points held
                                                        │  └─> ready_for_fulfillment
                                                        └─ member rejects or 48h passes
                                                           └─> cancelled + reservations released
```

**상점 주문 예약**은 주문 생성과 같은 트랜잭션에서 수행한다.

1. 회원의 사용 가능 포인트와 기존 보류액을 잠근다.
2. 카탈로그 가격 snapshot과 재고 행을 잠근다.
3. 모든 주문선의 재고와 포인트가 충분한지 검증한다.
4. 가용 재고에서 주문 수량을 제외하고 주문 금액의 포인트 hold를 만든다.
5. 주문·주문선·예약·운영 변경 기록·알림 outbox를 함께 저장한다.
6. 하나라도 실패하면 주문을 만들지 않는다.

가격 검토 주문도 제출 시 신청 금액만큼의 포인트와 재고를 예약한다. 운영진은 **상점 최종 가격 제안**으로 총액을 한 번 확정한다.

- 최종 가격이 신청 금액과 같거나 낮으면 회원의 기존 동의 범위이므로 바로 `ready_for_fulfillment`로 전환한다. 낮아진 차액의 hold는 같은 트랜잭션에서 해제한다.
- 최종 가격이 신청 금액보다 높으면 `awaiting_member_confirmation`으로 전환하고 회원에게 알린다. 재고와 기존 신청 금액 hold는 유지하지만 차액을 미리 예약하지 않는다.
- 회원은 48시간 안에 수락하거나 거절한다. 수락할 때 차액까지 원자적으로 예약할 수 있어야 `ready_for_fulfillment`로 전환한다. 포인트가 부족하면 상태는 그대로 두고 필요한 차액을 보여준다.
- 거절하거나 48시간 동안 응답하지 않으면 주문을 취소하고 재고와 기존 포인트 hold를 모두 해제한다.
- 운영진이 최종 가격을 제시한 시점에 `shop_price_review` 업무는 끝난다. 이후의 재확인은 회원 셀프서비스 상태이며 운영진의 미처리 업무로 계산하지 않는다.
- 회원이 동의한 금액보다 높은 포인트를 운영진이 바로 차감하는 경로는 허용하지 않는다.

예약 포인트는 회원 잔액에 표시하되 상점·회원 거래·환전에서 사용할 수 없다. 운영진이 **상점 전달 완료**를 실행하면 hold를 실제 `shop_purchase` 차감으로 전환하고 주문을 `completed`로 끝낸다. 회원의 별도 수령 승인은 요구하지 않는다.

전달 전 회원 취소나 운영진 거절은 재고와 포인트 예약을 같은 트랜잭션에서 모두 복구한다. 일반 주문은 `shop_fulfillment` 업무에, 가격이 확정되지 않은 주문만 `shop_price_review` 업무에 표시한다.

## 8. 길드 경제 Module

### 8.1 경계

포인트→실버 환전은 운영진의 정책 심사 대상이 아니다. 길드원·Albion 신원·양수 금액·사용 가능 포인트 조건을 서버가 검증할 수 있으므로 정상 신청은 즉시 접수한다. 운영진에게 남는 일은 Albion 안에서 실버를 실제로 전달하는 외부 이행뿐이다.

현재 `approve_exchange_request`는 운영진이 승인 버튼을 누를 때 잔액을 다시 확인하고 `approved` 상태와 `exchange_paid` 차감을 함께 만든다. 신청 시 포인트를 보류하지 않기 때문에 운영진이 지급을 준비하는 사이 상점·회원 거래 등에서 포인트가 먼저 사용될 수 있고, `approved`가 정책 승인인지 실제 지급인지도 불명확하다.

최종 상태는 다음과 같다.

```text
member submits valid exchange
  └─> awaiting_payout + exchange points held
        ├─ member edits amount ───────────────────────> awaiting_payout + hold adjusted
        ├─ member/operator cancels before claim ─────> cancelled + hold released
        └─ operator claims before in-game transfer ──> paying
              ├─ transfer not started; operator releases claim
              │  └─> awaiting_payout
              └─ silver delivered; operator confirms
                 └─> paid + hold converted to point debit
```

- 환전 금액과 보류 포인트는 1:1이며 상점의 환율/할인율을 적용하지 않는다.
- 신청·포인트 hold·상태·운영 변경 기록·알림 outbox는 한 트랜잭션에서 생성한다.
- `awaiting_payout`에서는 회원이 금액을 수정하거나 취소할 수 있고 hold도 같은 트랜잭션에서 조정한다.
- 운영진은 실버를 보내기 전에 요청을 claim해 `paying`으로 바꾼다. 이 상태에서는 회원 수정·취소와 다른 운영진의 중복 claim을 차단한다.
- 실제 지급 뒤 `markExchangePaid`가 hold를 한 번의 `exchange_paid` 차감으로 전환하고 요청을 `paid`로 끝낸다.
- 지급을 시작하지 않았다면 운영진은 사유와 함께 claim을 해제할 수 있다. `paying`은 시간 경과만으로 자동 완료·취소하지 않는다.
- 정상 경로에는 승인·거절을 두지 않는다. 지급 전 운영상 취소가 필요하면 사유를 남기고 hold를 복구한다.
- 일반 환전은 `exchange_fulfillment` 업무에 표시하고 승인 queue에는 넣지 않는다.

### 8.2 원자성과 외부 지급 경계

Postgres는 포인트 보류·상태 전이·중복 처리를 원자적으로 보장할 수 있지만 Albion의 실버 전달 자체와 DB commit을 하나의 트랜잭션으로 묶을 수는 없다. 따라서 지급 전 claim을 외부 작업 잠금으로 사용한다.

1. `claimExchangePayout`이 `awaiting_payout`을 잠그고 실행 운영진과 시작 시각을 기록한다.
2. 운영진이 Albion에서 실버를 전달한다.
3. 전달에 성공한 경우에만 `markExchangePaid`를 실행한다.
4. 전달하지 않았다면 `releaseExchangePayoutClaim`으로 대기 상태에 돌리고 사유를 기록한다.
5. 지급 여부가 불명확하면 자동으로 되돌리지 않고 오늘의 업무함에서 운영진 확인 대상으로 유지한다.

완료·취소·claim 해제는 모두 idempotency key를 사용한다. 같은 환전에 포인트 차감은 정확히 한 줄만 존재해야 하며, `paid` 상태와 `exchange_paid` 원장이 분리 commit되면 안 된다.

### 8.3 실버→포인트 적립 경계

길드 금고 로그는 입금자·금액·시각을 확인할 수 있지만 그 실버가 포인트 적립, 길드 회비, 보급 정산 등 어떤 목적으로 입금됐는지는 알려주지 않는다. 따라서 로그 행이 존재한다는 이유만으로 포인트를 자동 생성하지 않는다.

정상 흐름은 회원의 **입금 용도 지정**과 **금고 실버 입금 원본**을 결합한다.

```text
guild silver deposit log imported
  └─> unallocated deposit visible to its member
        ├─ member leaves it unselected ───────────────> no point change
        └─ member designates whole deposit for points
              ├─ deposit is valid and unallocated ──> credited + deposit allocated
              └─ missing/conflicting/already used ──> deposit_match_exception
```

- 회원에게는 자신의 활성 Albion 캐릭터와 연결된 미배정 입금만 보여준다.
- 회원은 별도 금액을 입력하지 않고 원본 입금 한 건을 선택한다. 적립 금액은 원본 금액과 1:1이다.
- 한 입금 원본은 한 용도에 전체 배정한다. 여러 용도로 나누려면 Albion에서 별도 입금하도록 안내한다.
- 원본 입금 배정·`donation_approved` 포인트 가산·운영 변경 기록·알림 outbox는 같은 트랜잭션에서 생성한다.
- 원본 입금 ID에는 tenant 범위 unique allocation을 걸어 더블 클릭·재신청·다른 지원 기능에서의 중복 사용을 막는다.
- 정확히 확인된 정상 지정은 운영진 승인 없이 끝난다. 운영진에게는 `deposit_match_exception`만 표시한다.

현재의 스크린샷 제출은 정상 경로에서 제거한다. 로그 반영 지연, 누락, 캐릭터명 연결 실패처럼 원본을 선택할 수 없는 경우에만 신청 금액·스크린샷을 보조 증빙으로 받는다. 보조 증빙만으로 자동 적립하지 않고 운영진이 실제 원본에 연결하거나 사유와 함께 거절한다.

### 8.4 원본과 용도 배정

`guild_silver_deposit_logs`는 금고 로그 원문과 파싱된 입금자·금액·시각·dedupe fingerprint를 tenant별로 보존한다. `guild_silver_deposit_allocations`는 각 원본이 어떤 지원 용도에 배정됐는지를 정확히 한 번 기록한다.

```text
guild_silver_deposit_logs
  id, guild_id, logged_at, albion_player_name, silver,
  source_fingerprint, imported_at

guild_silver_deposit_allocations
  guild_id, deposit_log_id UNIQUE, purpose,
  guild_member_id, reference_id, allocated_at
```

금고 원본은 사실 기록이고 allocation은 앱 안의 용도 기록이다. 원본을 수정해 용도를 표현하거나 스크린샷을 원본으로 승격하지 않는다. 포인트 적립을 취소·정정해야 하면 기존 원장과 allocation을 삭제하지 않고 반대 포인트 원장과 정정 기록을 추가한다.

### 8.5 회원 간 포인트 양도

포인트 양도는 거래 결제 기능이 아니다. 같은 길드의 활성 회원 사이에서 선물이나 개인 정산을 위해 포인트를 즉시 이전하는 단순한 원장 이동이다.

- 송신자는 수신자별 금액과 전체 합계를 최종 확인한 뒤 실행한다.
- 수신자는 활성 길드 회원이어야 하며 본인·게스트·다른 길드 회원은 선택할 수 없다.
- 사용 가능 포인트만 보낼 수 있고 상점·환전·회원 거래에 hold된 금액은 제외한다.
- 한 번에 여러 수신자를 선택하면 모든 `transfer_out`·`transfer_in` 원장 쌍이 함께 성공하거나 모두 실패한다.
- 완료 즉시 수신자 잔액에 반영하며 수신자 수락, 운영진 승인, 취소, 환불, 분쟁 상태를 만들지 않는다.
- 거래 보호가 필요한 아이템·서비스 대금은 회원 거래장을 사용하도록 양도 확인 화면에 명시한다.
- 양도는 길드 재정의 수입·지출이 아니다.

현재 RPC는 한 요청마다 새 `ref_id`를 만들기 때문에 네트워크 재전송을 동일 요청으로 식별할 수 없다. 최종 구조는 `point_transfer_batches`에 idempotency key, 송신 회원, 수신 목록 snapshot, 총액을 먼저 기록하고 원장 쌍이 같은 트랜잭션에서 그 batch를 참조하게 한다.

잘못 보낸 양도를 회원이 되돌리는 기능은 제공하지 않는다. 운영진이 예외적으로 바로잡아야 하면 원본 batch를 보존한 채 사유와 원본 참조를 가진 별도 포인트 조정을 기록한다.

### 8.6 이벤트 특별 보상

이벤트 특별 보상은 모든 이벤트 참가자에게 정기적으로 주는 출석 포인트가 아니다. 종료된 이벤트에서 특별한 기여나 운영상 명확한 사유가 있을 때 운영진이 한 번만 집행하는 재량 보상이다. 리기어 지급과도 별개다.

현재 흐름은 요청 생성과 승인을 나누지만 같은 `EVENT_MANAGE` 권한을 가진 동일인이 두 행동을 모두 할 수 있다. 따라서 `pending → approve/reject`는 실질적인 이중 통제가 아니라 운영진 클릭과 업무만 늘리는 형식적 승인이다.

최종 흐름은 다음과 같다.

- `EVENT_REWARD_GRANT` 같은 별도 지급 권한을 둬 일반 이벤트 편집 권한과 포인트 생성 권한을 분리한다.
- 운영진은 종료된 이벤트, 지급 대상 snapshot, 지급 금액 snapshot, 필수 사유, 총 지급 포인트를 한 화면에서 검토한다.
- 화면은 대상 수·개별 금액·총액을 강조하고 되돌릴 수 없는 원장 생성임을 알린 뒤 강한 최종 확인을 한 번 받는다.
- 확정 command는 `event_special_reward_grants`, 대상별 포인트 원장, 운영 변경 기록, 알림 outbox를 한 트랜잭션에서 생성한다.
- idempotency key로 중복 클릭·네트워크 재시도에도 같은 지급이 한 번만 생기게 한다.
- 정상 지급에는 `pending`, 승인, 거절, 두 번째 자기 승인, `event_payout_review` 업무를 만들지 않는다.
- 이벤트 종료나 참가 확정만으로 자동 지급하지 않는다. 정기 참가 보상이 필요해지면 별도 정책과 기능으로 설계한다.
- 오지급은 원본 지급을 삭제·수정하지 않고 원본을 참조하는 별도 관리자 포인트 조정으로 바로잡는다.

## 9. 기능 가용성 Module

### 9.1 원칙

모든 설정 boolean을 기능 토글로 바꾸지 않는다.

- 기능 상태: 이 길드가 이 Module을 사용하는가?
- 기능 정책: 켜진 Module 안에서 어떤 운영 규칙을 사용하는가?

예를 들어 `auto_regear_enabled`는 보급 기능의 자동화 정책이고, `regear_window_minutes`는 보급 정책이다. 둘 다 기능 catalog의 별도 항목이 아니다.

### 9.2 저장 구조

코드의 `FEATURE_CATALOG`가 기능의 의미·경로·의존성·필요 권한을 정의한다. DB는 길드별 상태와 설정값만 저장한다.

#### `guild_feature_states`

| 필드 | 의미 |
|---|---|
| `guild_id`, `feature_key` | 길드와 기능 |
| `state` | `disabled`, `setup_required`, `enabled`, `draining` |
| `config` | 기능별 작은 설정 |
| `updated_by_member_id`, `updated_at` | 변경 주체와 시각 |

상태 의미:

- `disabled`: 데이터는 보존하되 탐색·경로·업무·알림·자동화를 막는다.
- `setup_required`: 운영진의 설정 화면만 열고 회원용 기능은 숨긴다.
- `enabled`: 권한과 정책에 따라 정상 제공한다.
- `draining`: 신규 신청·자동 생성을 막고 기존 미처리 건의 처리 화면·업무·필수 알림만 유지한다.

기능을 끌 때 열린 업무가 없으면 바로 `disabled`로 간다. 열린 업무가 있으면 `draining`으로 전환하고 마지막 건이 종결되면 자동으로 `disabled`가 된다.

예를 들어 환전 포인트 보류가 남아 있으면 새 신청은 막되 기존 실버 지급·취소는 계속한다. 회원 거래 에스크로와 상점 주문 예약도 같은 원칙으로 먼저 해소한다.

### 9.3 최초 catalog

항상 켜진 기반 기능:

- `workspace`
- `events`
- `members`
- `member_self_service`
- `settings_and_permissions`

선택 기능:

| 기능 key | 포함 범위 |
|---|---|
| `operation_assets` | 빌드 템플릿, 전술 |
| `supply` | 리기어, 제작, 재고; config로 `silver/stock/craft` mode 선택 |
| `guild_economy` | 포인트, 환전, 기부, 정산 |
| `guild_shop` | 길드 상점과 주문 |
| `member_market` | 같은 길드 포인트의 에스크로를 사용하는 회원 거래장 |
| `asset_accounting` | 시폰·루팅 검증 |
| `insights` | 내부 통계·리더보드 |
| `content_compliance` | 명시적 규칙 준수 |
| `public_guild_profile` | 외부 길드 프로필 |

전투 관련 기능 key의 재설계는 이 문서 범위에서 제외한다.

`member_market`과 `guild_shop`은 공통 포인트 잔액을 사용하므로 `guild_economy`에 의존한다. 다만 회원 거래 주문·가격 제안·에스크로·분쟁은 별도 거래 기록에 보존하고 최종 회원 간 포인트 이동만 공통 포인트 원장에 반영한다. `guild_economy`를 끄려면 두 기능을 먼저 `disabled`로 만들거나, 열린 주문이 있으면 함께 `draining`해 에스크로를 모두 해소해야 한다.

### 9.4 Interface와 Adapter

```ts
interface GuildFeatureModule {
  getSnapshot(guildId: string, actor: Actor): Promise<GuildFeatureSnapshot>
  requireUse(
    guildId: string,
    featureKey: FeatureKey,
    use: 'setup' | 'read' | 'intake' | 'process' | 'notify' | 'automate',
  ): Promise<void>
  changeState(command: ChangeFeatureState, context: CommandContext): Promise<void>
}
```

`draining`에서는 `read/process/notify` 중 기존 업무 종결에 필요한 use만 허용하고 `intake/automate`는 거부한다.

같은 snapshot을 다음 Adapter가 사용한다.

- AppShell·AppSidebar 내비게이션 Adapter
- page/layout 직접 경로 guard Adapter
- server action command guard Adapter
- 오늘의 업무함 필터 Adapter
- 알림·Discord·cron 필터 Adapter
- 셀프서비스 도입 checklist Adapter

내비게이션 숨김만으로 기능을 차단하지 않는다.

### 9.5 기존 설정 이관

- `craft_regear_enabled`: `supply` 상태와 `craft` mode로 이관
- `guild_profile_enabled`: `public_guild_profile` 상태로 이관
- `alliance_content_compliance_enabled`: 고객 기능이면 catalog로 이관하고 tenant slug 조건을 제거한다. 아직 특정 길드 실험이면 고객 catalog에서 제외한다.
- 나머지 운영 boolean은 해당 Module의 정책으로 유지한다.

기존 길드에는 현재 보이는 기능이 그대로 보이도록 backfill한다. 새 길드는 설치 wizard에서 필요한 기능만 선택하고 `setup_required → enabled`로 전환한다.

## 10. 오늘의 업무함 Module

### 10.1 책임

오늘의 업무함은 도메인 작업을 직접 처리하지 않는다. 각 Module의 미처리 업무를 같은 형태로 모으고 올바른 처리 화면으로 연결한다.

통계, 동기화 건강 상태, 모집 준비도, 이벤트 준비율은 대시보드의 별도 섹션으로 남긴다.

### 10.2 Interface

```ts
interface WorkQueueAdapter {
  key: WorkQueueKey
  featureKey: FeatureKey | null
  requiredCapability: Capability
  getSummary(context: QueueContext): Promise<WorkQueueSummary>
  getHref(item?: WorkQueueItem): string
}

interface TodayWorkQueueModule {
  getSnapshot(context: QueueContext): Promise<TodayWorkQueueSnapshot>
}
```

`TodayWorkQueueModule`은 등록된 Adapter를 병렬 조회하고 기능 가용성·권한·긴급도를 한 번만 적용한다.

### 10.3 표준 출력

```ts
interface WorkQueueSummary {
  key: WorkQueueKey
  count: number
  oldestCreatedAt: string | null
  urgency: 'normal' | 'watch' | 'overdue' | 'critical'
  reason: string
  href: string
}
```

초기 queue:

- `regear_review`
- `exchange_fulfillment`
- `deposit_match_exception`
- `shop_price_review`
- `shop_fulfillment`
- `member_trade_dispute`
- `craft_collection`
- `craft_receipt_overdue`

신규 Module 도입 후:

- `identity_conflict`
- `member_merge_review`
- `supply_attention`
- `outbox_failure`

정상적인 자동 신원 연결과 정상 알림 재시도는 업무로 만들지 않는다. 반복 실패나 모순만 올린다.

### 10.4 단일 source of truth

한 번 만든 snapshot을 다음 화면이 공유한다.

- 관리자 오늘 화면
- 승인 업무 화면의 tab·count
- sidebar badge
- 모바일 빠른 업무 카드
- Discord 일일 요약

`admin_pending_badge_counts`, 직접 fallback query, approval tab 배열, deep link map을 각각 유지하지 않는다. 전환 기간에는 결과를 비교하되 최종 단계에서 legacy fallback을 삭제한다.

업무 해결은 링크된 도메인 Module의 command를 사용한다. 업무함에 범용 “승인” mutation을 만들지 않는다.

## 11. 운영 변경 기록 Module

### 11.1 사용자 용어

사용자 화면의 “감사 로그”는 모두 “운영 변경 기록”으로 바꾼다. 내부 테이블 이름 `admin_audit_log`는 첫 단계에서 유지해도 된다. 슈퍼 관리자 기록은 서비스 운영 기록으로 분리한다.

### 11.2 수집 범위

기록한다:

- 금전·포인트·재고 변경
- 신청 승인·거절·취소
- 보급 상태 변경
- 회원 병합·캐릭터 이전·접근 철회
- 권한·정책·기능 상태 변경
- 대량 import·reset·삭제

기록하지 않는다:

- 화면 조회
- 검색·필터·일반 탐색
- 원본 IP·User-Agent
- OAuth token·session·초대 코드
- Discord 메시지 원문 전체

### 11.3 표준 schema

```ts
interface OperationalChange {
  guildId: string
  action: OperationalChangeKind
  actorMemberId: string | null
  actorIdentityKind: 'discord' | 'local' | 'system' | 'support'
  actorSubjectId: string
  targetKind: OperationalTargetKind
  targetId: string
  beforeSummary: Record<string, JsonValue> | null
  afterSummary: Record<string, JsonValue> | null
  reason: string | null
  source: 'web' | 'discord' | 'cron' | 'support'
  correlationId: string
  createdAt: string
}
```

- action별 schema allowlist로 details를 검증한다.
- 자유로운 metadata dump를 허용하지 않는다.
- 표시명 snapshot은 보조 정보이며 ID를 대체하지 않는다.
- tenant 삭제 전까지 보존하고 별도의 행동 추적 데이터는 추가하지 않는다.

### 11.4 기록 신뢰성

금전·재고·권한·병합처럼 중요한 DB mutation은 같은 RPC 트랜잭션에서 기록한다. 애플리케이션의 fire-and-forget insert를 성공 기준으로 사용하지 않는다.

외부 후속 작업만 outbox를 사용한다. 운영 변경 기록이 실패하면 중요한 mutation도 실패해야 한다.

### 11.5 Interface

```ts
interface OperationalChangeModule {
  appendWithinTransaction(entry: OperationalChangeInput): Promise<void>
  list(query: OperationalChangeQuery): Promise<OperationalChangePage>
}
```

UI나 Discord Adapter는 `appendWithinTransaction`을 직접 호출하지 않는다. 도메인 command Implementation이 상태 변경과 함께 호출한다.

## 12. Module별 Depth와 삭제 테스트

### 12.1 실제 Seam과 Adapter

모든 경계를 Seam으로 만들지 않는다. 실제로 둘 이상의 정책이나 채널 Implementation이 교체되는 곳만 Seam으로 둔다.

| Seam | Adapter |
|---|---|
| 접근 신원 확인 | Discord OAuth Adapter, 로컬 길드 계정 Adapter |
| 보급 재고 소비 정책 | 직접 재고 출고 Adapter, 제작 리기어 장부 차감 Adapter |
| 업무 종류 공급 | 리기어·환전·기부·상점·거래·제작·신원 예외 Queue Adapter |
| 후속 알림 전달 | 앱 알림 Adapter, Discord Adapter |

기능 가용성의 nav·route·action·queue 연결은 서로 교체되는 Implementation이 아니라 같은 결정을 각 surface에 번역하는 Adapter다.

### 12.2 Depth, Leverage, Locality와 deletion test

| Module | 숨기는 복잡성 | 삭제 테스트 |
|---|---|---|
| 회원 신원 | Discord·local·캐릭터·길드 이전·병합 | 삭제하면 모든 기능이 `discord_id`와 `local:` 분기를 다시 알아야 한다. |
| 보급 흐름 | 심사·지급 mode·제작 상태·재고·상환 | 삭제하면 server action이 DB 갱신 순서와 실패 보상을 다시 구현해야 한다. |
| 회원 거래 | 주문·포인트 에스크로·확인 기한·분쟁 | 삭제하면 거래 action과 cron이 포인트 보류·해제 순서와 경쟁 조건을 다시 구현해야 한다. |
| 길드 상점 | 정상·가격 검토 주문·재고 예약·포인트 hold·전달 | 삭제하면 상점 action이 예약과 결제의 원자성 및 업무 분류를 다시 구현해야 한다. |
| 길드 경제 | 환전 hold·외부 지급 claim·금고 입금 배정·포인트 양도 batch·이벤트 특별 보상 확정·공통 원장 | 삭제하면 경제 action이 포인트 예약, 외부 지급, 입금 중복 사용, 즉시 양도와 특별 보상 중복 지급의 경쟁 조건을 다시 구현해야 한다. |
| 기능 가용성 | 상태·의존성·권한·surface 차단 | 삭제하면 route·nav·queue·notification에 같은 조건이 흩어진다. |
| 오늘의 업무함 | queue 목록·count·긴급도·deep link | 삭제하면 badge·승인 tab·대시보드가 각자 목록을 유지한다. |
| 운영 변경 기록 | 중요 action allowlist·PII 금지·조회 | 삭제하면 각 action이 기록 schema와 민감정보 기준을 다시 판단한다. |

각 Module은 호출부 수보다 내부 규칙이 많아 높은 Depth를 갖는다. 한 규칙 변경이 여러 surface에 반영되는 Leverage를 높이고, 관련 규칙이 한 Module 안에 머무는 Locality를 지킨다. deletion test에서 규칙이 다시 호출부로 퍼지면 그 Module은 실제 경계다.

## 13. 단계별 구현 순서

마이그레이션 번호는 다른 작업과 충돌하지 않도록 구현 시점의 다음 번호를 사용한다. 모든 적용은 사용자의 별도 지시 후 `./scripts/safe-db-push.sh <라벨>`로 수행한다.

### 단계 0 — 기준선과 관측

목표: 데이터 변경 없이 현재 상태를 측정한다.

- 제작 전달·재고 잠재 불일치 보고서
- 길드별 중복 Albion 캐릭터 후보
- 로컬/Discord 중복 회원 후보
- 현재 기능 surface와 설정 매핑
- 기존 queue count 결과 snapshot
- 중요 mutation과 audit coverage matrix

완료 기준:

- 모든 보고서가 `guild_id` 단위로 실행된다.
- 자동 보정은 하지 않는다.
- 이후 단계의 before/after 비교값이 보존된다.

### 단계 1 — 보급 원자성

목표: 가장 치명적인 상태·재고 불일치를 먼저 제거한다.

- `supply_fulfillments`, `guild_inventory_movements`, `domain_outbox`, command idempotency 저장소 추가
- 현재 재고 baseline 생성
- 고위험 RPC가 같은 트랜잭션에서 사용할 최소 운영 변경 기록 append 기반 추가
- 승인·재고 지급·제작 전달 RPC 추가
- 웹·Discord Adapter를 같은 Supply Interface로 연결
- 기존 best-effort 재고 차감 제거
- 작업 수락 전 고정 정산 조건 표시·수락과 박스 입고 시 자동 정산 확정 추가
- 신규 작업의 납품 시 재료비 입력과 건별 정산 승인·거절 흐름 제거
- 전환 시점 이전의 기존 정산 승인 대기 건은 자동 승인하지 않고 기존 운영 흐름으로 해소
- 수령 확인 지연 전환·자동 알림·명시적 박스 해제 command 추가
- 미수령 회수 종료의 재고 복구·박스 해제·지급 종결·업무 제거를 한 트랜잭션으로 처리
- 기존 `expired` 자동 박스 해제 제거
- `supply_attention` 탐지 추가

완료 기준:

- 전달 완료와 재고 projection이 분리 commit될 수 없다.
- 같은 명령을 10번 보내도 movement와 지급은 한 번이다.
- 직접 재고 출고의 부족은 전체 rollback되고, 제작 박스 입고의 부족분은 재고 외 조달로 정확히 기록된다.
- 제작 박스 입고는 완제품 장부 재고를 음수로 만들지 않는다.
- 제작자가 본 고정 정산 조건과 박스 입고 때 기록된 지급 예정액이 항상 일치한다.
- 동일 박스 입고 command를 재시도해도 제작자 지급 예정액은 한 번만 기록된다.
- 확인 기한이 지나도 수령·미수령 회수 종료·이동 확인 전에는 박스가 해제되지 않는다.
- 미수령 회수 종료는 승인·정산 이력을 보존하면서 현재 지급 건을 끝내고 후속 재지급 업무를 만들지 않는다.
- 알림 장애가 보급 상태를 되돌리지 않으며 outbox에서 재시도된다.

### 단계 1A — 회원 거래 에스크로 종결

목표: 전달 완료 뒤 구매자 무응답으로 포인트가 영구 보류되는 상태를 제거한다.

- 회원 거래 주문에 `confirmation_due_at`, `auto_released_at` 추가
- 판매자 전달 완료 시 72시간 기한 고정과 구매자 알림 outbox 생성
- 구매자 수령 확인·분쟁 제기와 scheduler 자동 지급을 동일한 잠금·idempotency 규칙으로 처리
- 분쟁 업무에 전액 지급·전액 환불 command와 필수 운영 사유 연결
- 기존 `delivered` 주문은 배포 시 즉시 지급하지 않고 전환 시점부터 새 72시간 기한을 부여해 구매자에게 알림
- 기존 `disputed` 주문은 자동 변경 없이 운영진 처리 대상으로 유지

완료 기준:

- 정상 `delivered` 주문은 구매자 확인 또는 72시간 무응답 자동 지급으로 종결된다.
- `disputed` 주문은 scheduler가 절대 지급하거나 환불하지 않는다.
- 포인트 원장·에스크로·주문·거래 사건·운영 변경 기록이 분리 commit되지 않는다.
- 같은 자동 지급 작업을 반복 실행해도 포인트는 한 번만 이동한다.

### 단계 1B — 길드 상점 자동 접수

목표: 정상 주문의 중복 승인 업무와 포인트 초과 약속을 제거한다.

- 표준 카탈로그 주문을 `ready_for_fulfillment`, 예외 주문을 `pending_review`로 분리
- 주문 생성 시 재고와 포인트 hold를 함께 만드는 원자적 RPC 추가
- 일반 주문의 관리자 승인·거절 흐름과 알림 제거
- 즉시 금액 변경·차감이 가능한 `p_total_points_override`를 최종 가격 제안 command로 교체
- 최종 가격이 신청 금액 이하이면 자동 준비 전환, 인상이면 48시간 회원 재확인 상태로 전환
- 회원 수락 시 차액 hold를 원자적으로 추가하고 거절·무응답 시 모든 예약을 해제하는 command와 scheduler 추가
- 운영진의 물품 준비 queue와 전달 완료 command 추가
- 전달 완료 시 point hold를 `shop_purchase` 차감으로 전환
- 취소·거절 시 재고와 point hold를 함께 복구
- 기존 `pending` 주문은 `price_review_required`에 따라 두 상태로 backfill하되 기존 재고 예약을 다시 차감하지 않음

완료 기준:

- 일반 주문은 관리자 승인 없이 즉시 물품 준비 queue에 나타난다.
- 여러 주문·회원 거래·환전이 동시에 발생해도 같은 포인트를 중복 예약할 수 없다.
- 주문 생성, 재고 예약, 포인트 hold 중 하나만 남는 부분 성공이 없다.
- 회원이 확인하지 않은 인상 금액은 차감되지 않는다.
- 같은 금액·가격 인하는 운영진 재처리 없이 물품 준비로 넘어가고, 가격 인상은 회원 수락 뒤에만 차액이 예약된다.
- 가격 재확인 거절·48시간 무응답은 재고와 포인트 예약을 모두 복구한다.
- 전달 완료와 포인트 차감이 분리 commit되지 않는다.
- 취소·거절 재시도를 반복해도 재고와 포인트가 한 번만 복구된다.

### 단계 1C — 환전 자동 접수와 지급 이행

목표: 환전 심사 업무를 없애고 포인트 사용과 인게임 지급의 불일치를 막는다.

- 공통 point hold에 환전 보류 유형 추가
- 신청 시 포인트 hold와 `awaiting_payout`을 함께 만드는 원자적 command 추가
- 운영진 승인·거절 UI를 지급 대기·지급 처리 시작·지급 완료 UI로 교체
- `claimExchangePayout`, `releaseExchangePayoutClaim`, `markExchangePaid` command 추가
- 회원 수정·취소 시 hold 조정·해제
- `approved` 표시와 알림을 `paid`/지급 완료 용어로 교체
- 기존 `pending`은 포인트 hold 성공 시 `awaiting_payout`으로 이관하고, 잔액이 부족하면 사유를 알린 뒤 취소
- 기존 `approved`·`rejected` 기록은 과거 결과로 그대로 보존

완료 기준:

- 정상 환전은 운영진 승인 없이 즉시 지급 대기 업무에 나타난다.
- 지급 완료 전에는 포인트가 다른 상점·회원 거래·환전에 중복 사용되지 않는다.
- 지급 처리 중에는 회원 취소와 다른 운영진의 중복 처리가 불가능하다.
- 지급 완료와 `exchange_paid` 차감이 분리 commit되지 않는다.
- claim·완료 재시도에도 지급 완료와 포인트 차감은 한 번만 생긴다.

### 단계 1D — 금고 입금 원본 기반 포인트 적립

목표: 입금 용도를 추정하지 않으면서 정상 적립의 운영진 심사를 제거한다.

- tenant별 금고 실버 입금 원본과 dedupe fingerprint 저장
- 원본별 단일 용도를 보장하는 입금 allocation 추가
- 회원의 미배정 입금 목록과 `포인트 적립용으로 지정` command 추가
- 정상 지정 시 allocation과 `donation_approved` 포인트 가산을 한 트랜잭션으로 처리
- 현재 스크린샷·금액 입력은 원본 누락·불일치 예외 접수로 축소
- 운영진 승인 queue를 `deposit_match_exception` queue로 교체
- 기존 `pending`은 입금자·금액·시각 기준으로 유일한 미배정 원본이 확인될 때만 자동 연결하고 나머지는 예외로 유지
- 기존 `approved`·`rejected`와 스크린샷은 과거 근거로 보존

완료 기준:

- 용도 지정이 없는 금고 입금은 포인트를 만들지 않는다.
- 정확한 원본을 선택한 정상 적립은 운영진 승인 없이 완료된다.
- 한 원본 입금으로 포인트가 두 번 적립되거나 다른 지원 용도와 중복 배정될 수 없다.
- 스크린샷만 있는 신청은 자동 적립되지 않는다.
- 원본 allocation과 포인트 가산이 분리 commit되지 않는다.

### 단계 1E — 포인트 양도 경계와 재시도 안전성

목표: 즉시 양도를 회원 거래와 구분하고 동일 요청의 중복 차감을 막는다.

- `point_transfer_batches`와 command idempotency key 추가
- 송신자·수신자·금액·메모 snapshot과 원장 쌍을 같은 트랜잭션으로 생성
- 확인 화면에 즉시 확정·취소 불가·거래 보호 없음 안내
- 회원 거래 대금은 회원 거래장 사용 안내
- 예외 정정은 원본 batch를 참조하는 별도 관리자 조정으로 기록
- 수신자 조회와 RPC를 안정적인 길드 회원 기록 기준으로 전환

완료 기준:

- 같은 양도 요청을 반복 전송해도 batch와 원장 이동은 한 번만 생긴다.
- 여러 수신자 중 하나라도 유효하지 않거나 총 사용 가능 포인트가 부족하면 전체가 실패한다.
- 완료된 양도는 승인·수령·분쟁 queue를 만들지 않는다.
- 양도 금액은 길드 재정 수입·지출로 집계되지 않는다.
- 원래 양도와 예외 정정 이력이 모두 보존된다.

### 단계 1F — 이벤트 특별 보상 단일 확정

목표: 특별 보상의 형식적 자기 승인을 없애고 권한·최종 확인·원장 신뢰성을 강화한다.

- 일반 이벤트 관리와 분리된 특별 보상 지급 capability 추가
- 요청 생성·승인 RPC를 지급 확정 command 하나로 교체
- 종료 이벤트, 대상·금액 snapshot, 필수 지급 사유, 총액의 강한 최종 확인 UI 추가
- grant·대상별 포인트 원장·운영 변경 기록·알림 outbox를 한 트랜잭션으로 생성
- command idempotency key와 grant 단위 중복 방지 추가
- 전환 당시 기존 `pending` 요청은 자동 지급하지 않고 기존 운영 흐름으로 한 번 종결
- 기존 `approved`·`rejected`는 과거 결과로 그대로 보존
- legacy `pending`이 모두 종결된 뒤 `event_payout_review` queue와 승인 알림 제거
- 오지급 정정은 원본 grant를 참조하는 별도 관리자 조정으로만 처리

완료 기준:

- 특별 보상은 전용 권한을 가진 운영진의 한 번의 최종 확인으로만 지급된다.
- 이벤트 종료나 참가만으로 자동 지급되지 않는다.
- 동일 command 재시도에도 grant와 대상별 포인트 가산은 한 번만 생성된다.
- 대상별 지급 중 일부만 성공하는 상태가 존재하지 않는다.
- 신규 특별 보상은 승인·거절 queue를 만들지 않는다.
- 원본 지급과 예외 정정 이력이 모두 보존된다.

### 단계 2 — 길드 회원 기록 기반

목표: 로그인 ID와 업무 이력 주체를 분리한다.

- 신원 4개 테이블 추가
- 기존 회원·로컬 계정·Albion link backfill
- `guild_member_id` dual-write 시작
- DB partial unique index로 캐릭터 단일 활성 길드 강제
- 재정·보급·이벤트 소유권부터 read cutover

완료 기준:

- 모든 활성 접근 신원이 정확히 한 길드 회원 기록으로 해석된다.
- 같은 Discord는 여러 길드에 존재할 수 있다.
- 같은 캐릭터의 동시 활성 길드가 DB에서 불가능하다.

### 단계 3 — 병합·이전·길드 전환

목표: 운영진 개입을 예외로 줄인다.

- 로컬 계정의 Discord 연결 UX
- 증거 일치 자동 병합과 충돌 업무
- API 확인 기반 캐릭터 이전
- 이전 길드 기록 보존 검증
- 전역 내 길드 목록과 일회용 host handoff

완료 기준:

- 정상 연결과 정상 길드 이전에는 관리자 승인이 필요 없다.
- 모순·고위험 권한 충돌만 업무함에 나타난다.
- 병합 전후 포인트·활동 총합과 source 이력이 보존된다.

### 단계 4 — 기능 catalog

목표: 필요한 기능만 보이는 셀프서비스 제품으로 만든다.

- `guild_feature_states`와 code catalog 추가
- 기존 설정 backfill
- nav·route·action·queue·notification·cron Adapter 연결
- 열린 업무가 있는 기능의 `draining` 전환과 자동 종료
- `guild_economy`와 상점·회원 거래장의 dependency 및 열린 에스크로 draining 연결
- 새 길드 설치 wizard 연결
- tenant slug·수동 SQL에 의존하는 고객 기능 제거

완료 기준:

- disabled 기능의 모든 surface가 숨거나 거부된다.
- draining 기능은 신규 접수 없이 기존 업무 처리 surface만 유지된다.
- setup_required 기능은 관리자 설정 경로만 열린다.
- 기존 길드의 보이는 기능은 backfill 직후 바뀌지 않는다.
- 봇만 새로 초대한 테스트 길드가 운영자 개입 없이 기능을 켤 수 있다.

### 단계 5 — 오늘의 업무함 통합

목표: 처리 대상 정의를 한 곳으로 모은다.

- WorkQueue Adapter registry 추가
- 단일 queue snapshot query/RPC 추가
- 관리자 오늘·승인 tab·sidebar badge·모바일 카드 연결
- Discord digest는 같은 snapshot 사용
- identity·supply 예외 queue 연결
- legacy count·link·fallback 제거

완료 기준:

- 모든 surface의 count가 동일하다.
- 권한 없거나 기능이 `disabled`인 queue는 어떤 surface에도 나타나지 않고, `draining` queue는 기존 건 처리에만 나타난다.
- queue에서 이동한 화면이 실제 해결 command를 제공한다.

### 단계 6 — 운영 변경 기록 신뢰성

목표: 중요한 변경을 빠짐없이, 감시 데이터 없이 남긴다.

- 4개 locale과 데모·가이드의 사용자 용어 변경
- action별 schema allowlist
- 중요 mutation RPC 내부 기록으로 전환
- `guild_member_id`, `correlation_id`, source 채널 추가
- 원본 IP·UA를 허용한다고 오해할 수 있는 schema comment 제거
- coverage test 추가

완료 기준:

- 중요 mutation 성공 행마다 같은 correlation의 변경 기록이 정확히 하나 존재한다.
- 실패한 mutation에는 성공 기록이 없다.
- page view·IP·UA·token이 저장되지 않는다.

### 단계 7 — contract와 삭제

목표: 전환용 중복을 실제로 제거한다.

- 남은 업무 테이블의 `guild_member_id` 읽기 전환
- legacy `discord_id` write 중단
- `local:` synthetic ID 분기 제거
- 분산 기능 boolean·queue 정의·audit helper 제거
- dual-read·fallback·shadow code 제거
- 사용하지 않는 index·호환 컬럼은 별도 migration으로 마지막에 제거

완료 기준:

- 삭제 테스트에서 규칙이 호출부로 새지 않는다.
- 코드 검색으로 legacy write가 0건이다.
- 두 번 이상의 안정 배포와 production 지표 확인 뒤에만 destructive cleanup을 한다.

## 14. 검증 계획

### 단위 테스트

- 상태 머신의 허용·금지 전이
- 기능 dependency와 surface 결정
- queue 긴급도·정렬·권한 필터
- 자동 병합 위험 판정
- 운영 변경 action별 details scrub

### 통합 테스트

실 Postgres가 결정하는 항목은 반드시 통합 테스트로 검증한다.

- 두 길드가 같은 캐릭터를 동시에 활성화하려는 경쟁
- 같은 idempotency key의 동시 보급 명령
- 직접 출고의 부족 재고 rollback
- 제작 박스 입고의 부분 장부 차감과 재고 외 조달 수량
- 작업 수락 시 개인 조달·길드 조달별 고정 정산액과 수수료 조합
- 박스 입고 시 건별 운영진 승인 없이 지급 예정액 생성 및 중복 ledger 방지
- 제작자별 미지급 실버 합계와 묶음 지급 완료의 원본 항목 보존
- 작업 수락 후 가격 snapshot 변경 차단
- 수령 확인 지연 전환 후 box unique 점유 유지
- 수령·미수령 회수 종료·이동 command별 박스 해제와 재고 movement
- 미수령 회수 종료 후 `returned_unclaimed`, 기존 승인·제작자 정산 불변, 후속 업무 미생성
- 수령 확인과 미수령 회수 종료 command의 경쟁 요청에서 한 전이만 성공
- fulfillment·movement·projection·운영 기록의 원자성
- 판매자 전달 완료 뒤 72시간 경계의 무응답 자동 지급과 중복 실행 방지
- 구매자 수령 확인·분쟁 제기·자동 지급의 동시 요청에서 한 종결만 성공
- 분쟁 중 scheduler 지급 차단과 운영진의 전액 지급·전액 환불
- 기존 `delivered` 주문의 전환 후 72시간 유예와 기존 `disputed` 주문 불변
- 일반 상점 주문의 재고·포인트 동시 예약과 관리자 승인 없는 자동 접수
- 상점·회원 거래·환전의 동시 요청에서 사용 가능 포인트 초과 예약 차단
- 가격 검토 주문의 신청 금액 이하 최종 가격과 인상 최종 가격 분기
- 가격 인상 수락 시 차액 포인트 부족의 무변경 실패
- 가격 인상 수락·거절·48시간 만료의 경쟁 요청에서 한 종결만 성공
- 회원이 재확인하지 않은 인상 금액의 예약·차감 차단
- 상점 전달 완료 시 point hold의 단일 구매 차감 전환
- 상점 주문 취소·거절의 재고·포인트 예약 원자 복구와 idempotency
- 기존 상점 `pending` 주문의 가격 검토 여부별 무중복 backfill
- 환전 신청과 포인트 hold의 원자성 및 상점·회원 거래와의 동시 잔액 경쟁
- 환전 금액 수정·취소의 hold 조정·해제와 idempotency
- 환전 지급 claim과 회원 취소·다른 운영진 claim의 경쟁 요청
- 환전 지급 완료와 `exchange_paid` 단일 차감의 원자성
- 환전 claim 해제 뒤 재처리 및 `paying` 상태의 자동 종결 금지
- 기존 환전 `pending`의 hold backfill과 기존 `approved`·`rejected` 불변
- 금고 실버 입금 원본의 tenant별 dedupe와 동일 원본 동시 용도 지정 경쟁
- 용도 미지정 입금의 무포인트 보장과 정상 지정의 `donation_approved` 단일 가산
- 다른 회원·다른 길드·이미 배정된 입금 원본 선택 차단
- 입금 allocation·포인트 가산·운영 변경 기록의 원자성
- 로그 누락·중복·불일치 신청의 예외 queue 분류와 스크린샷 단독 자동 적립 차단
- 기존 입금 적립 `pending`의 유일 원본 매칭과 기존 `approved`·`rejected` 불변
- 동일 포인트 양도 idempotency key의 재전송과 단일 batch·원장 쌍 보장
- 다중 수신자 양도의 전체 성공·전체 rollback
- 포인트 양도와 상점·환전·회원 거래 hold의 동시 사용 가능 잔액 경쟁
- 본인·게스트·다른 길드·비활성 회원에 대한 양도 차단
- 양도 원본 batch와 예외 관리자 정정 원장의 연결 및 원본 불변
- 동일 이벤트 특별 보상 idempotency key 재전송의 단일 grant·원장 보장
- 특별 보상 대상별 원장 가산의 전체 성공·전체 rollback
- 특별 보상 전용 capability 경계와 일반 이벤트 관리 권한의 지급 차단
- 신규 특별 보상의 무승인 queue·무 `pending` 상태 보장
- 특별 보상 원본 grant와 예외 관리자 정정 원장의 연결 및 원본 불변
- 기존 특별 보상 `pending`의 명시적 종결과 기존 `approved`·`rejected` 불변
- 로컬→Discord 병합 후 tenant 격리
- 캐릭터 이전 후 이전 길드 이력 불변
- RLS·RPC의 `guild_id` 위조 차단
- 기능 disabled 상태의 직접 action 차단
- 기능 draining 상태의 신규 접수 차단과 기존 업무 처리 허용
- 열린 회원 거래 에스크로가 있을 때 `member_market`·`guild_economy`의 dependency와 draining 종결

### UI 검증

- 모바일: 신청 상태, 빠른 승인, 업무함, 길드 전환, 거래 수령 확인 기한, 상점 주문 예약, 상점 최종 가격 재확인, 환전 지급 대기·취소, 미배정 입금 용도 지정, 포인트 양도 최종 확인
- 데스크톱: 기능 설정, 보급 상세, 상점 물품 준비, 환전 지급 처리, 입금 매칭 예외, 거래 분쟁, 이벤트 특별 보상 최종 확인, 병합 충돌, 운영 변경 기록
- 직접 URL 접근과 뒤로가기
- Discord 링크에서 웹으로 이어지는 handoff
- ko/ja/en/zh key·placeholder 동등성

### 운영 검증

| 지표 | go 기준 |
|---|---|
| 신규 보급 부분 완료 | 0건 |
| movement 합계와 재고 projection 불일치 | 0건 |
| 확인 기한이 지난 정상 회원 거래의 미해소 에스크로 | 0건 |
| 상점 주문의 재고 예약과 포인트 hold 불일치 | 0건 |
| 환전 `paid`와 `exchange_paid` 원장 불일치 | 0건 |
| 지급 처리 중 환전의 중복 운영진 claim | 0건 |
| 동일 금고 입금 원본의 중복 allocation·포인트 적립 | 0건 |
| 정상 매칭 입금 중 운영진 수동 심사가 필요한 비율 | 0% |
| 동일 포인트 양도 의도의 중복 batch·차감 | 0건 |
| 동일 이벤트 특별 보상 의도의 중복 grant·가산 | 0건 |
| 신규 특별 보상의 승인 대기 업무 | 0건 |
| 캐릭터 다중 활성 길드 | 0건 |
| queue surface 간 count 불일치 | 0건 |
| enabled/draining/disabled surface 불일치 | 0건 |
| 중요 mutation의 변경 기록 누락 | 0건 |
| outbox 영구 실패 | 업무함에 100% 노출 |

## 15. 배포와 롤백

### 15.1 배포 원칙

- 모든 schema 변경은 expand → backfill → dual-write → read cutover → contract 순서로 한다.
- DB migration과 코드 push는 프로젝트 규칙대로 분리한다.
- destructive migration은 최소 두 번의 안정 배포 후 별도 실행한다.
- 각 단계는 독립적으로 배포 가능해야 한다.

### 15.2 롤백

- 단계 1~6은 additive schema를 유지해 이전 코드가 계속 읽을 수 있게 한다.
- 새 read path에 문제가 생기면 compatibility read로 되돌리되 신규 write의 idempotency·원장은 유지한다.
- 이미 기록된 movement나 회원 이력을 삭제해 롤백하지 않는다. 반대 movement·새 history row로 되돌린다.
- outbox는 재실행 가능하며 메시지 중복은 idempotency key로 차단한다.
- 기능 catalog cutover는 길드별 rollout cohort로 되돌릴 수 있다.
- contract 단계는 별도 승인과 백업 확인 없이는 진행하지 않는다.

## 16. 최종 완료 정의

다음이 모두 성립해야 “최종 단계”가 완료된 것이다.

1. 업무 데이터의 주체가 Discord ID가 아니라 길드 회원 기록이다.
2. 로컬 계정 연결과 정상 캐릭터 이전은 자동이며 예외만 운영진이 본다.
3. 보급 이행·재고·원장·중요 기록이 원자적이다.
4. 기능 상태가 nav·route·action·queue·notification·cron에 동일하게 적용된다.
5. 오늘의 업무함의 목록·count·링크가 하나의 snapshot에서 나온다.
6. 운영 변경 기록은 중요한 변경만 빠짐없이 남기고 행동 감시 데이터는 수집하지 않는다.
7. 새 길드가 SQL·env·서비스 운영자 도움 없이 같은 상태에 도달한다.
8. 전환용 legacy 분기와 fallback이 제거되어 삭제 테스트를 통과한다.
9. 정상 환전은 포인트를 먼저 보류하고 실제 실버 지급 완료와 포인트 차감이 하나의 결과로 남는다.
10. 금고 입금은 회원의 명시적 용도 지정이 있을 때만 포인트가 되며 정상 원본 매칭은 운영진 없이 완료된다.
11. 포인트 양도는 즉시 확정되는 선물·개인 정산으로만 동작하고 회원 거래의 보호 흐름을 우회하지 않는다.
12. 이벤트 특별 보상은 예외적인 경우에만 전용 권한과 한 번의 최종 확인으로 지급되고 형식적 자기 승인 업무를 만들지 않는다.
