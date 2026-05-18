# Server Actions — Agent Rules

`src/app/actions/*.ts` 는 모두 Next.js Server Actions. 멀티테넌트 SaaS 라 tenant 격리가 모든 쿼리의 invariant.

## Hard rules

1. **파일 상단 `'use server'`** — 한 파일에 server action 만. RSC/Client 컴포넌트 섞지 말 것.
2. **세션 + guildId 먼저 해결**.
   ```ts
   const session = await getSession()
   if (!session) return null            // 또는 throw — caller 와 합의된 시그니처로
   const guildId = await getSessionGuildId(session)
   ```
3. **모든 DB 쿼리에 `.eq('guild_id', guildId)`** — multi-tenant 격리. 누락 = 다른 길드 데이터 누출. `scope-audit` 스킬 트리거 작업이면 5축 중 "DB" 체크에서 잡힘.
4. **`getAdminClient()` 사용** — RLS 우회. 그래서 더더욱 guild_id 필터를 코드에서 보장해야 한다.
5. **placeholder interpolation 은 i18n 에러 메시지에서만** — DB 쿼리에는 절대 string concat. `eq/in/lt` 등 builder method 만 사용.

## 캐싱 전략

읽기 무거운 액션은 `unstable_cache` 로 wrap. 매 요청 N 초 캐시.

```ts
import { unstable_cache } from 'next/cache'

const computeCached = unstable_cache(
  computePure,                         // pure function — DB read, no session
  ['cache-key-namespace'],
  { revalidate: 60 }
)

export async function getLeaderboard(window: LeaderboardWindow = 'week') {
  const session = await getSession()
  if (!session) return null
  const guildId = await getSessionGuildId(session)
  // session/guildId 는 캐시 키에 포함시키지 말고 인자로 명시 전달
  const cards = await computeCached(guildId, window, bundleSplits)
  return { window, ...cards, fetchedAt: new Date().toISOString() }
}
```

캐시할 함수는 `getSession()` 호출 금지 — 세션이 캐시 키를 오염. guildId 를 인자로 명시.

## 병렬 읽기

여러 DB read 가 독립이면 `Promise.all` 로 묶기. round-trip 절감 효과 크다 (Phase 10 events/[id] 사례).

```ts
const [tentativeDirectory, avatarMap] = await Promise.all([
  loadTentativeDirectory(guildId, eventId),
  loadAvatarMap(guildId, memberIds),
])
```

## 입력 검증

`Zod` 우선. 외부 호출 (client 폼 submit) 라 입력은 untrusted.

```ts
const schema = z.object({ id: z.string().uuid() })
const parsed = schema.safeParse(input)
if (!parsed.success) return { error: 'invalid-input' }
```

## Bulk 액션은 상한선

대량 처리 액션은 항상 `MAX_*` 상수로 cap. UI 가 무한 루프 / DB 폭주 막는 1차 방어. 예:

```ts
const BULK_REGEAR_LIMIT = 50
if (ids.length > BULK_REGEAR_LIMIT) {
  return { ...result, fatalError: tErr('bulkRegearTooMany', { max: BULK_REGEAR_LIMIT }) }
}
```

## Delete 는 row count 검증

`.delete().eq(...).select('id')` 패턴 — 0 행 삭제면 race-condition (이미 처리됨) 신호.

```ts
const { data: deletedRows } = await db
  .from('donation_requests').delete()
  .eq('guild_id', guildId).eq('id', id).eq('status', 'pending')
  .select('id')
if (!deletedRows || deletedRows.length === 0) {
  return { error: tErr('alreadyProcessedCannotCancel') }
}
```

## 회귀 위험

- `getSession()` 을 `unstable_cache` 안에 넣으면 다른 사용자에게 캐시 누출.
- `.eq('guild_id', guildId)` 누락 → 다른 길드 데이터 노출 (severity = critical, 즉시 fix).
- `'use client'` 와 같은 파일에 두면 빌드 에러.
