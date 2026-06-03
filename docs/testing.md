# 자동 테스트 가이드 (Albion Guild Manager)

이 문서는 사람 협력자 + AI 에이전트가 같이 읽는 1차 출처. 새 도메인 invariant 를 추가하거나 마이그 / RPC 를 건드릴 때 이 가이드를 참고해서 테스트를 같이 짝지을 것. AGENTS.md 가 가리키는 정식 문서.

---

## 0. 개요

테스트 인프라는 두 층으로 분리:

| 층 | 대상 | 환경 | 실행 명령 | CI |
|----|------|------|-----------|----|
| 단위 (Phase 0+1) | `src/lib/*.ts` 순수 함수 | node (외부 의존 0) | `npm test` | 매 push/PR (GitHub Actions) |
| 통합 (Phase 2) | 실 Postgres 가 결정하는 invariant | 로컬 supabase (docker) | `npm run test:integration` | env 없으면 자동 skip |
| 원격 마이그 드리프트 | 로컬 migration 파일과 linked Supabase 적용 상태 | Supabase CLI + 운영 프로젝트 secrets | `npm run check:migrations:remote` | main push 에서 필수 실행, secrets 누락/불일치 시 실패 |

선택 기준: **"실 Postgres 동작이 결과를 결정하는가?"** YES → 통합, NO → 단위.

---

## 1. 단위 테스트 (Phase 0+1)

### 1-1. 위치 / 명명

`src/lib/<도메인>.test.ts` — 검증할 함수 옆에 짝지어 둠.

### 1-2. 실행

```bash
npm test                # 1회 실행
npm run test:watch      # 변경 시 자동 재실행
```

### 1-3. 패턴

```ts
import { describe, it, expect } from 'vitest'
import { someFunc } from './some-module'

describe('<함수 이름>', () => {
  it('<검증할 동작>', () => {
    expect(someFunc(input)).toEqual(expected)
  })
})
```

### 1-4. 현재 커버

정확한 파일/케이스 수는 `npm test` 출력 기준으로 본다. 주요 커버 축은 `battle-bundling`, `albion-battles`, `tracked-kills`, `low-engagement-cut`, `auto-regear`, `weapon-category`, `weapon-display`, `member-stats`, API/route guard, i18n parity, migration 정적 검사다.

### 1-5. 새 단위 테스트 추가 — 5축 체크의 "테스트" 축

새 순수 함수 작성 시 **항상** `*.test.ts` 같이 추가. `scope-audit` 스킬의 5축 체크에서 "테스트" 축 만족 여부 명시 보고.

---

## 2. 통합 테스트 (Phase 2)

### 2-1. 언제 추가?

✅ **추가 필수**:
- 마이그 추가/수정 — 특히 unique 제약, FK, RLS 정책 변경
- 새 RPC (`security definer` 함수) 추가
- ON CONFLICT 절 / ON DELETE CASCADE 등 DB 무결성
- 멀티테넌트 격리가 걸린 모든 동작
- DB 트리거 검증

❌ **불필요 (단위로 충분)**:
- `src/lib/*.ts` 의 순수 함수
- 외부 의존 없는 도메인 계산

### 2-2. 파일 명명 / 위치

```
src/<영역>/<설명>.integration.test.ts
```

예: `src/lib/multi-tenant-scope.integration.test.ts`, `src/lib/regear-rpc.integration.test.ts`.

`*.integration.test.ts` suffix 가 매칭 키 — 일반 `npm test` 에서는 자동 exclude, `npm run test:integration` 만 실행.

### 2-3. 코드 패턴

```ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  hasTestEnv,
  getTestServiceClient,
  createTestTenant,
  type TestTenant,
} from '@/test/integration-helpers'

// env 없으면 자동 skip — CI / 다른 사람 PC 안전
const describeIntegration = hasTestEnv() ? describe : describe.skip

describeIntegration('<invariant 설명>', () => {
  let tenant: TestTenant
  const client = getTestServiceClient()

  beforeEach(async () => {
    tenant = await createTestTenant()
  })

  afterEach(async () => {
    await tenant.cleanup()  // CASCADE 로 child rows 자동 정리
  })

  it('<검증할 행동>', async () => {
    const { error } = await client.from('your_table').insert({
      guild_id: tenant.guildId,
      // ...
    })
    expect(error).toBeNull()
  })
})
```

### 2-4. 핵심 컨벤션

- **`describe.skip` 가드 필수** — env 없는 환경에서 빨강 X
- **localhost 기본값** — `TEST_SUPABASE_URL` 은 기본적으로 `localhost` / `127.0.0.1` / `::1` 만 허용. 전용 remote test project 는 `ALLOW_REMOTE_TEST_SUPABASE=1` 이 필요
- **prod env 재사용 금지** — `TEST_SUPABASE_URL === NEXT_PUBLIC_SUPABASE_URL` 또는 `TEST_SUPABASE_SERVICE_KEY === SUPABASE_SERVICE_ROLE_KEY` 면 fail-fast
- **`createTestTenant` + `tenant.cleanup` 페어** — 테스트 격리. cleanup 이 CASCADE 로 child rows 한 번에 정리
- **항상 `tenant.guildId` 사용** — 멀티테넌트 격리 검증 가능
- **service-role 클라이언트** (`getTestServiceClient`) — RLS 우회. anon 클라이언트가 필요하면 직접 `createClient` 해서 별도 변수
- **fileParallelism off** — DB 연결 직렬화 (config 에 이미 설정)

### 2-5. 로컬 셋업 (1회)

1) Docker Desktop 설치 + 실행
   - 메뉴바에 🐳 아이콘 안정화까지 대기
   - `docker ps` 가 에러 없이 빈 테이블 출력하면 OK

2) Supabase 로컬 인스턴스 띄움 (프로젝트 디렉터리에서)
   ```bash
   cd /Users/dalyn1234/projects/albion-zvz
   supabase start
   ```
   - **반드시 프로젝트 디렉터리에서 실행** — HOME 에서 띄우면 별개 프로젝트 (`dalyn1234`) 가 만들어져 포트 충돌

3) 마이그 모두 적용
   ```bash
   supabase db reset
   ```
   - `000_initial_schema` 가 베이스 테이블/RPC/policy 를 생성
   - 그 다음 `001~` 최신 번호까지 누적 변경 적용
   - "Finished supabase db reset on local database" 나오면 OK

4) `.env.local` 에 두 줄 추가 (`supabase status` 의 `Secret` 키 사용)
   ```
   TEST_SUPABASE_URL=http://127.0.0.1:54321
   TEST_SUPABASE_SERVICE_KEY=sb_secret_...
   ALLOW_REMOTE_TEST_SUPABASE=0
   ```
   ⚠️ **prod 의 `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` 와 절대 공유 금지** — 실수로 prod 가리키면 테스트 길드 생성 + CASCADE 로 다른 테넌트 데이터 손실

5) vitest 가 `.env.local` 자동 안 읽으니 export
   ```bash
   export $(grep "^TEST_SUPABASE" .env.local | xargs)
   ```

### 2-6. 일상 실행

```bash
# 셸 새로 열었으면:
cd /Users/dalyn1234/projects/albion-zvz
export $(grep "^TEST_SUPABASE" .env.local | xargs)

# 마이그 변경 후:
supabase db reset

# 매 테스트 실행:
npm run test:integration

# 특정 파일만:
npm run test:integration -- multi-tenant-scope

# 운영 DB migration 적용 상태 확인 (main push 와 같은 strict check):
npm run check:migrations:remote
```

### 2-7. 원격 마이그 드리프트 가드

운영 DB 마이그가 필요한 main 반영 순서:

1. `supabase/migrations/<3자리>_*.sql` 추가, `npm test` 로 파일명/연속성 정적 검사 통과.
2. `./scripts/safe-db-push.sh <label>` 로 linked Supabase 에 마이그 적용. `supabase db push --linked` 직접 실행 금지.
3. 필요하면 `npm run check:migrations:remote` 로 로컬 파일과 원격 적용 이력이 정확히 같은지 확인.
4. `git push origin main`.

CI 조건:

- PR 에서는 운영 Supabase secrets 를 쓰지 않는다. 대신 `npm test` 안의 migration 정적 검사로 중복 번호/누락 번호를 막는다.
- `main` push 에서는 `.github/workflows/test.yml` 의 `migration-drift` job 이 반드시 실행된다.
- `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD` 중 하나라도 없으면 job 은 skip 하지 않고 실패한다.
- `scripts/check-supabase-migration-drift.sh` 는 `supabase migration list --linked` 출력의 3자리 `Local` / `Remote` 버전이 정확히 같은지 확인한다.

실패 해석:

| 메시지 | 의미 | 조치 |
|--------|------|------|
| `local-only migration NNN` | repo 에는 있지만 원격 DB 에 아직 적용되지 않음 | `./scripts/safe-db-push.sh <label>` 실행 후 다시 확인 |
| `remote-only migration NNN` | 원격 DB 에 적용됐지만 repo 에 파일이 없음 | 누락된 migration 파일 복구 또는 branch 동기화 |
| `Unable to parse Supabase migration list output` | Supabase CLI 출력 형식이 바뀌어 파서가 검증 불가 | 스크립트 파서를 고친 뒤 재실행 |

이 가드는 main push 시점에 원격과 repo 가 **정확히 같은 migration version set** 을 갖는지 보는 최종 안전망이다. 새 migration 이 pending 인 상태도 main 에서는 실패로 취급한다.

### 2-8. 흔한 함정 & 해결

| 증상 | 원인 | 해결 |
|------|------|------|
| 전체 `describe.skip` 으로 통과 | env vars 안 흘러감 | `export $(grep ...)` 다시 |
| `Could not find the table 'X'` | 마이그 미적용 / 새 마이그 반영 안 됨 | `supabase db reset` |
| `Cannot connect to ECONNREFUSED` | supabase daemon 멈춤 | `supabase start` |
| 엉뚱한 곳에서 `23505 unique violation` | 이전 cleanup 실패로 잔재 | `supabase db reset` |
| `port 54322 already allocated` | 다른 프로젝트가 점유 | `supabase stop --project-id <other>` |

⚠️ **거의 모든 문제는 `supabase db reset` 으로 해결됨**. 헷갈리면 일단 reset.

---

## 3. 확장 우선순위 (ROI 높은 순)

새 통합 테스트를 추가할 때 다음 순서로 고르면 가장 안전망 가치 높음:

1. **RPC tenant 격리** — 45개 `security definer` RPC 중 핵심 (`apply_shop_stock_delta`, `apply_shop_baseline`, `book_kill_reward`, ...).
   - 위협: SECURITY DEFINER 가 RLS 우회 → WHERE `guild_id` 절 빠지면 cross-tenant 침범
   - 관련 메모리: `feedback_albion_zvz_rpc_tenant_scope.md`

2. **RLS 정책 효과 검증** — anon client + JWT claim 으로 다른 테넌트 데이터 접근 시도 → 차단 확인
   - 위협: RLS 우회 또는 정책 누락
   - 패턴: `createClient(url, anon_key, { global: { headers: { Authorization: ... } } })` 로 JWT claim 모킹

3. **ON CONFLICT ↔ unique index 일관성** — 마이그 추가 시 코드의 `onConflict` 문자열과 SQL unique 컬럼셋 매칭
   - 위협: 컬럼셋 불일치로 row 가 잘못 덮어쓰기
   - 관련 메모리: `feedback_albion_zvz_unique_scope.md`

4. **CASCADE 무결성** — 부모 row 삭제 시 자식 자동 정리 (tenants → 모든 child)
   - 위협: FK ON DELETE 누락 시 고아 row 잔재

---

## 4. AI 에이전트용 체크리스트

새 작업이 다음 중 하나에 해당하면 **반드시** 짝짓는 테스트를 같은 PR 에 포함:

- [ ] 새 순수 함수 작성 → `*.test.ts` 같이 추가
- [ ] 새 마이그 (`supabase/migrations/<3자리>_*.sql`) → 영향 받는 invariant 의 `*.integration.test.ts` 추가/수정
- [ ] 새 RPC (security definer) → tenant 격리 검증 통합 테스트 추가
- [ ] `onConflict` 문자열 변경 → 대응 통합 테스트로 컬럼셋 일치 검증
- [ ] RLS 정책 추가/수정 → anon + service role 양쪽에서 접근 차단 / 허용 검증

테스트가 깨지면 의도된 갱신인지 사용자에게 확인 후 갱신. 모호하면 `scope-audit` 스킬의 5축 체크 결과로 보고.

---

## 5. 인프라 위치 참조

| 경로 | 역할 |
|-----|------|
| `vitest.config.ts` | 단위 테스트 설정 (`*.integration.test.ts` exclude) |
| `vitest.integration.config.ts` | 통합 테스트 설정 (include integration only, `fileParallelism: false`, 30s timeout) |
| `src/test/integration-helpers.ts` | `hasTestEnv` / `getTestServiceClient` / `createTestTenant` 공용 픽스처 |
| `src/lib/*.test.ts` | 단위 테스트 |
| `src/**/*.integration.test.ts` | 통합 테스트 |
| `supabase/migrations/000_initial_schema.sql` | 베이스 테이블/RPC/policy (idempotent) |
| `supabase/migrations/<3자리>_*.sql` | 누적 마이그 |
| `scripts/check-supabase-migration-drift.sh` | linked Supabase 원격 적용 상태와 로컬 migration 파일 비교 |
| `.github/workflows/test.yml` | CI 정의 (Node version file + tsc + lint + vitest + main-push migration drift) |
| `.env.local` | 로컬 비밀 (TEST_SUPABASE_URL/SERVICE_KEY) — git ignore |
| `.env.local.example` | 셋업 템플릿 |
