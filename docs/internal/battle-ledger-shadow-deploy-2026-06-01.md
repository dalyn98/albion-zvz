# 전투 원장 Shadow 구축/배포 보고서

작성일: 2026-06-01
커밋: `8d18c2a feat: add battle ledger shadow sync`
배포: Vercel production `dpl_DRvMmfKZryzFTbUQMEGgh6GHmCdC`
DB 백업: `/Users/dalyn1234/backups/albion-zvz/pre-migration/2026-06-01_193753-battle-ledger-shadow.tar.gz`

## 한 줄 요약

기존 `/battles` 기능은 그대로 유지하면서, Albion API 전투 원본을 "공적 전투 원장" 형태로 병행 저장하는 shadow 구조를 추가했다.

## 무엇을 작업했나

### 1. DB 구조 추가

마이그레이션 `supabase/migrations/178_battle_ledger_shadow.sql` 을 production DB에 적용했다.

새로 추가된 테이블:

- `albion_registry_entities`
  - Albion에 등장한 길드, 연합, 플레이어를 `server + type + albion_id` 기준으로 저장한다.
  - 이름은 표시/검색용이고, 내부 join 기준은 Albion ID다.
- `albion_registry_entity_names`
  - 전투 snapshot 또는 guild sync에서 관측한 이름 이력을 보존한다.
- `battle_record_snapshots`
  - `battle_records.raw_battle` 의 hash와 요약을 저장한다.
  - Albion API 재수집 시 원본이 바뀌었는지 추적하기 위한 테이블이다.
- `battle_participant_snapshots`
  - 전투 당시의 길드, 연합, 플레이어 참여 snapshot을 저장한다.
  - 현재 길드/연합 상태로 덮어쓰지 않는다.
- `battle_view_projections`
  - 길드 페이지에서 볼 전투 view를 계산해 저장한다.
  - `direct` = 해당 길드가 직접 참여한 전투
  - `alliance` = 해당 길드는 없지만, 전투 당시 소속 연합이 참여한 전투
- `battle_projection_diffs`
  - 기존 전투 기록과 새 projection을 비교한 차이를 저장한다.
  - `missing_shadow_projection`, `missing_legacy_projection`, `opponent_mismatch`, `meaningful_policy_mismatch`, `result_estimate_mismatch` 를 구분한다.

### 2. Cron 병행 저장 추가

`/api/cron/battle-tracker` 가 기존 로직을 그대로 수행한 뒤, 새 shadow 테이블에도 병행 저장하도록 했다.

기존 유지:

- `battle_records`
- `tenant_battle_records`
- 기존 `/battles` 목록/상세 read path
- 기존 provisional/final matchup 재평가 로직

새로 추가:

- 전역 registry 저장
- raw battle snapshot hash 저장
- participant snapshot 저장
- 길드별 direct/alliance projection 저장
- 기존 `tenant_battle_records` 와 새 `battle_view_projections` 자동 비교
- `battle_projection_diffs` 에 미해소 diff 저장 및 사라진 diff `resolved_at` 처리
- cron 응답에 shadow 저장 건수 노출

### 3. 전투 노출 정책 반영

새 projection은 원본을 삭제하지 않고 view policy로 분류한다.

- `default_meaningful`
  - 기본 전투 목록에 노출 가능한 의미 있는 전투
  - subject 측과 opponent 측이 모두 최소 규모 기준을 만족해야 한다.
- `small_or_low_engagement`
  - 원장에는 남기지만 기본 목록에서는 제외할 수 있는 소규모/저관여 전투

결과도 `win/loss` 확정이 아니라 추정값으로 저장한다.

- `advantage`
- `disadvantage`
- `even`
- `unclear`

## 내가 확인해야 할 것

### 1. 사이트가 정상 배포됐는지

확인 위치:

- Vercel project: `albion-guildmanager`
- Production deployment: `dpl_DRvMmfKZryzFTbUQMEGgh6GHmCdC`
- Production URL: `https://albion-guildmanager.com`

확인 기준:

- Vercel deployment status가 `Ready`
- `https://albion-guildmanager.com/api/health` 가 `200`
- 기존 `/battles` 화면이 이전처럼 열린다.
- 전투 목록/상세 UI가 갑자기 바뀌지 않았다.

이번 작업은 shadow 저장만 추가했으므로, 사용자 화면에서 새 UI 변화가 보이면 안 된다.

### 2. Cron이 shadow row를 쓰고 있는지

확인 위치:

- Vercel Logs
- Function/Route: `/api/cron/battle-tracker`

확인 기준:

cron 실행 결과 또는 로그에서 아래 값들이 0보다 커지는지 본다.

- `shadow_registry_entities`
- `shadow_snapshots`
- `shadow_participants`
- `shadow_projections`
- `projection_diffs_compared_battles`
- `projection_diffs_active`
- `projection_diffs_inserted`
- `projection_diffs_refreshed`
- `projection_diffs_reactivated`
- `projection_diffs_resolved`

전투가 없는 시간대에는 0일 수 있다. 전투가 많은 시간대의 다음 cron 이후 확인하는 것이 좋다.

### 3. Supabase에서 row가 쌓였는지

확인 위치:

- Supabase Dashboard
- SQL Editor 또는 Table Editor

기본 확인 SQL:

```sql
select 'albion_registry_entities' as table_name, count(*) from public.albion_registry_entities
union all
select 'albion_registry_entity_names', count(*) from public.albion_registry_entity_names
union all
select 'battle_record_snapshots', count(*) from public.battle_record_snapshots
union all
select 'battle_participant_snapshots', count(*) from public.battle_participant_snapshots
union all
select 'battle_view_projections', count(*) from public.battle_view_projections;
```

direct/alliance projection 확인:

```sql
select
  relation_scope,
  view_policy,
  count(*) as rows
from public.battle_view_projections
group by relation_scope, view_policy
order by relation_scope, view_policy;
```

기대값:

- `direct` row가 생긴다.
- 연합 전투가 관측되면 `alliance` row도 생긴다.
- 소규모 전투는 삭제되지 않고 `small_or_low_engagement` 로 남는다.

### 4. 자동 비교 diff가 쌓이는지

확인 위치:

- 슈퍼어드민 → 진단/백필
- `전투 원장 Diff 리포트`
- API: `/api/admin/battle-ledger-diff-report?since_hours=168&limit=50`

확인 기준:

- `active.total` 이 현재 미해소 diff 수다.
- `active.byDiffType` 으로 차이 종류를 본다.
- `active.byRelationScope` 에서 `alliance` 는 기존 기능에 없던 새 커버리지일 수 있다.
- `recentResolved` 는 최근 자동 비교에서 사라져 해소 처리된 diff다.

직접 SQL로 볼 경우:

```sql
select
  diff_type,
  count(*) as rows
from public.battle_projection_diffs
where resolved_at is null
group by diff_type
order by rows desc;
```

샘플 확인:

```sql
select
  diff_type,
  subject_albion_id,
  legacy_payload,
  shadow_payload,
  detected_at
from public.battle_projection_diffs
where resolved_at is null
order by detected_at desc
limit 20;
```

### 5. 전투 당시 snapshot이 보존되는지

확인 SQL:

```sql
select
  participant_type,
  count(*) as rows,
  count(distinct entity_albion_id) as entities
from public.battle_participant_snapshots
group by participant_type
order by participant_type;
```

기대값:

- `guild`, `alliance`, `player` 타입이 저장된다.
- `guild_name`, `alliance_name` 은 현재 상태가 아니라 전투 당시 Albion API snapshot 기준이다.

### 6. 원본 hash가 저장되는지

확인 SQL:

```sql
select
  count(*) as snapshot_rows,
  count(distinct battle_record_id) as battles,
  min(fetched_at) as first_seen,
  max(fetched_at) as last_seen
from public.battle_record_snapshots;
```

기대값:

- `raw_hash` 는 64자리 hex 문자열이다.
- 같은 battle이 나중에 다른 raw payload로 재수집되면 같은 `battle_record_id` 아래 다른 `raw_hash` row가 추가될 수 있다.

## 주의할 점

### 기존 기능은 아직 새 원장을 읽지 않는다

이번 작업은 전환이 아니라 병행 구축이다.

아직 기존 화면이 읽는 주요 테이블:

- `battle_records`
- `tenant_battle_records`

새 테이블은 검증/비교/전환 준비용이다.

### `battle_projection_diffs` 는 자동 비교 결과다

cron이 새 shadow projection을 저장한 뒤 기존 `tenant_battle_records` 와 비교한다.

- 차이가 계속 존재하면 기존 diff row를 갱신한다.
- 차이가 사라지면 `resolved_at` 을 채운다.
- 과거에 해소된 diff가 다시 나타나면 `resolved_at` 을 비우고 재활성화한다.

### 롤백 영향

이번 DB 변경은 additive migration이다.

- 기존 테이블 삭제 없음
- 기존 컬럼 삭제 없음
- 기존 read path 변경 없음

문제가 생기면 우선 코드 커밋을 revert해서 shadow write만 중단하면 된다. 새로 생긴 DB 테이블은 기존 기능에 영향을 주지 않는다.

## 배포 전 검증 결과

로컬에서 아래 검증을 통과했다.

```bash
npx vitest run src/lib/battle-ledger-shadow.test.ts src/lib/battle-tracking-helpers.test.ts
npm run lint
npx --no-install tsc --noEmit --skipLibCheck
npm run build
```

Production 배포 후 확인:

- Vercel deployment status: `Ready`
- `https://albion-guildmanager.com/api/health`: `200`

## 다음 작업 제안

1. Diff 리포트로 1~2일치 active diff 패턴 확인
2. `missing_legacy_projection` 중 alliance-only row를 새 커버리지로 분리 표시할지 결정
3. 기존 `/battles` read path를 shadow projection 기반으로 전환할지 판단
4. 전환 전 길드 페이지에서 direct/alliance 필터 UX 설계
