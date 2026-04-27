# Auto-regear → tracked-kills 정합성 수정 스펙

## 1. 문제 (현재 동작)

`processAutoRegear` (src/lib/auto-regear.ts:383-390) 의 victim 조회:

```ts
.from('killboard_events')
.eq('role', 'victim')
.in('discord_id', [배정 슬롯 멤버])
.gte('occurred_at', event.battle_started_at)  // 상한 X, battle_id 매칭 X
```

업적/통계 (`tracked-kills.ts`) 가 적용하는 규칙들 — `tenant_battle_records` 와 `albion_battle_id` 정확 매칭, low-engagement 컷 (10명 미만 갱크 등 자동 제외), ±15분 시간창 — 을 **자동 리기어는 전혀 적용하지 않는다.**

### 위험 시나리오

1. **이벤트 외 사망 흡수**
   - 18:00 전투 배정, 22:00 솔로 갱크 사망 → 18:00 이벤트로 자동 청구 생성
2. **이벤트 간 attribution 충돌**
   - 18:00 + 20:00 두 이벤트 모두 배정, 20:30 사망 → `events` 처리 순서 (`battle_started_at asc`) 에 따라 18:00 이벤트가 먼저 가져감 (실제 죽은 전투 무관)
3. **low-engagement 컷 우회**
   - 8명 갱크 사망 → 통계엔 안 잡히지만 자동 리기어엔 잡힘 (블랙존 한정 정책 자체와도 충돌)

추가로 `regear_requests_auto_event_killboard_uniq` 는 `(event_id, killboard_event_id)` 단위 유니크. **두 이벤트가 같은 killboard_event_id 를 잡으면 서로 다른 행 두 개가 생성된다 (이중 청구 가능).** 새 매칭으로 이런 충돌을 사실상 차단.

## 2. 해법: 2단계 매칭

### 2.1 stage 1 — event ↔ tracked battle (느슨)

각 event 마다, 해당 길드의 tracked battle 집합 중 시간창이 겹치는 것들을 찾는다.

- 후보: `tenant_battle_records WHERE guild_id = event.guild_id AND started_at BETWEEN event.battle_started_at - 15min AND event.battle_started_at + 60min`
- low-engagement 컷 적용 (`isHighEngagement(home_kills, home_deaths, home_team_size)`)
- 결과: `Set<albionBattleId>` (joined to `battle_records.albion_battle_id`)

#### 시간창 선택 근거

- `-15min`: 호스트가 실제 전투 직전에 `battle_started_at` 마킹하지 못한 경우 보호
- `+60min`: 일반 ZvZ 5-30분, 멀티 얼라이언스 분리 시 후속 부분 전투 포함, 너무 길면 인접 이벤트와 겹침
- 매직 넘버지만 합리적 — 추후 길드별 설정으로 빼는 것은 YAGNI 시점에 결정

#### 빈 집합 케이스

- tracked battle 0개: 해당 이벤트는 자동 리기어 0건 발생 + 처리 완료 마킹 (`auto_regear_processed_at`)
- 결과 카운터: `events_skipped_no_tracked_battle` 신설

### 2.2 stage 2 — killboard_event ↔ tracked battle (정확)

stage 1 의 `Set<albionBattleId>` 을 사용해 killboard 조회를 변경:

```ts
.from('killboard_events')
.eq('role', 'victim')
.in('discord_id', [배정 슬롯 멤버])
.in('battle_id', [stage 1 결과])
```

- `gte('occurred_at', ...)` 제거 (battle_id 가 더 강한 필터)
- legacy NULL battle_id 행 (마이그 096 이전 sync) 은 정확 매칭에서 제외 → 안전 우선

#### legacy NULL battle_id 처리

현재 시점 (2026-04) 기준, 마이그 096 (`killboard_events_battle_id`) 적용 후 sync 된 행은 모두 battle_id 채워져 있다. 마이그 이전 row 가 자동 리기어 후보에 잡힐 가능성은 사실상 0 (해당 이벤트의 배틀 시각이 이미 며칠 전). 그래도 방어적으로 `.not('battle_id', 'is', null)` 추가.

## 3. 코드 변경 영역

### 3.1 새 파일 `src/lib/auto-regear-matching.ts`

```ts
export interface MatchedTrackedBattle {
  albionBattleId: number
  startedAtIso: string
  homeTeamSize: number
}

export async function findTrackedBattleIdsForEvent(
  db: SupabaseClient,
  guildId: string,
  battleStartedAtIso: string,
): Promise<MatchedTrackedBattle[]>
```

순수 함수 — auto-regear.ts 의 메인 흐름에서 한 줄로 호출. 단위 테스트 가능.

### 3.2 수정 파일 `src/lib/auto-regear.ts`

- victim 조회 전에 `findTrackedBattleIdsForEvent` 호출
- 반환 배열 길이 0 이면 `events_skipped_no_tracked_battle += 1` + mark-processed + continue
- 길이 > 0 이면 `albion_battle_id` 집합 만들어 `.in('battle_id', ...)` 로 변경
- `AutoRegearResult` 인터페이스에 `events_skipped_no_tracked_battle: number` 추가
- `events_skipped_retroactive` 위쪽 / `events_deferred_sync_lag` 옆에 배치

### 3.3 변경 없는 영역

- DB 스키마 (마이그 X)
- `regear_requests` 행 구조
- RPC `create_auto_regear_request`
- 다른 호출자들

## 4. 엣지 케이스 (의도된 동작)

| 상황 | 결과 |
|---|---|
| 이벤트 시간대에 tracked battle 없음 (8명 갱크, 비전투 등) | 0건 + 처리 완료 마킹 |
| 멀티 얼라이언스 분리 (1 이벤트 = N tracked battles) | 모든 battle_id 의 victim 합쳐서 처리 |
| 같은 battle_id 가 두 이벤트의 시간창에 모두 매칭 | 이론상 발생 가능 (이벤트 45분 간격) — `events_processed` 순서대로 먼저 처리되는 이벤트가 가져감. unique constraint 때문에 두 번째는 RPC NULL → `skipped_manual_exists` 카운터에 +1. 이 케이스는 운영자가 이벤트 시각을 너무 가깝게 잡은 결과로 흔치 않음 |
| killboard_events.battle_id = NULL (legacy sync) | 매칭 불가 → 자동 청구 X (안전) |
| tenant_battle_records 가 아직 sync 안 됨 (battle-tracker cron 보다 빨리 auto-regear cron 실행) | `last_battle_tracker_sync_at < battle_started_at + autoDelay` → `events_deferred_battle_tracker_lag` +1, mark-processed 안 함, 다음 cron 에 재시도 |

### 4-A. 마지막 케이스 보강 (구현 완료)

`events_deferred_sync_lag` 와 유사한 패턴. battle-tracker cron 이 5분 tick 안에서 늦게 끝나거나 한 번도 안 돌았다면 tenant_battle_records 가 비어 있어 stage 1 이 0건으로 보인다 — 그 경우 mark-processed 위험.

→ **구현됨**: battle-tracker cron 의 성공 run 마다 `last_battle_tracker_sync_at` 을 per-tenant upsert (killboard-sync 와 동일 패턴). auto-regear 는 killboard sync 가드와 같은 cutoff (`battle_started_at + autoDelay`) 로 비교. 둘 다 통과해야 stage 1 진입.

→ 새 카운터 `events_deferred_battle_tracker_lag` — 운영 중 폭증하면 두 cron 의 maxDuration 이나 처리 순서를 점검.

## 5. 테스트 시나리오

### 5.1 자기 길드 (멘헤라) 검증

배포 후 토글 ON → 다음 cron 결과를 카운터로 확인:

- `events_processed` (정상 처리한 이벤트 수)
- `requests_created` (실제 생성된 청구 수) — 이전 대비 줄어들 것 (가짜 attribution 제거)
- `events_skipped_no_tracked_battle` (tracked battle 매칭 0인 이벤트 수)

`tracked-kills.ts` 가 이미 운영 중인 지표 (멤버 K/D, 통계) 와 `requests_created` 가 일관되어야 한다.

### 5.2 단위 테스트 (옵션)

- `findTrackedBattleIdsForEvent` 의 시간창 매칭, low-engagement 컷, multi-row 매칭
- 픽스처: tenant_battle_records mock + battle_records mock

### 5.3 회귀 검증 항목

- 자동 리기어 수동 흐름 (관리자 승인) 무영향
- /me/regear/[id] 빌드 정보 편집 (Phase 3) 무영향
- 자동/수동 dedup (manual_exists 카운터) 무영향

## 6. 롤아웃

1. 자기 길드 (멘헤라) 토글 OFF (이미 완료, 2026-04-27)
2. 코드 머지 + 배포 (Vercel 자동)
3. 자기 길드 토글 ON → 다음 cron 결과 관찰 (15분 주기)
4. 1-2 사이클 결과 정상이면 (=`requests_created` 가 합리적, `events_skipped_no_tracked_battle` 가 폭증하지 않음, 통계와 일관) 멘헤라 그대로 운영
5. 다른 테넌트 토글 변경은 self-serve 흐름의 일부 (각 길드 어드민이 직접 켜는 것이 기본). 본 스펙 변경은 _기존 토글 ON 길드들에도 자동 적용_ 됨 — 추가 마이그/공지 없이 안전한 방향으로 동작 변경

## 7. observability

- `AutoRegearResult.events_skipped_no_tracked_battle` 카운터 신설
- 기존 cron 로그 (`/api/cron/auto-regear/route.ts`) 가 이 result 를 그대로 출력하므로 추가 로깅 없이 운영 가시화

## 8. 비목표 (이 스펙 범위 밖)

- 자기 길드 토글 ON 결정 (운영자 판단)
- battle-tracker cron 동기화 보강 (필요 시 별도 작업)
- legacy NULL battle_id 행 백필 (이미 `killboard-backfill-battle-id` 라우트 존재 추정)
- 다중 이벤트 attribution 충돌 (45분 간격 이벤트) 해결 — 운영 가이드로 회피
