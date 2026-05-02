-- 100-tenant scale prep: add indexes that will matter as table sizes grow.
-- 현 5T (killboard_events 6K, tenant_battle_records 80) 에서는 영향 거의 없음.
-- 100T 이상에서는 이들 쿼리가 인덱스 없으면 풀스캔으로 떨어진다.

-- ────────────────────────────────────────────────────────────
-- 1) tenant_battle_records.battle_record_id
--    /battles/<id> 의 cross-tenant peer lookup (src/app/actions/battles.ts:150).
--    "같은 battle_record_id 를 추적하는 다른 active tenant" 조회는
--    기존 UNIQUE (guild_id, battle_record_id) 가 guild_id 가 leading 이라
--    where battle_record_id = ? 단독 필터 시 인덱스 사용 불가 → seq scan.
-- ────────────────────────────────────────────────────────────
create index if not exists idx_tenant_battle_records_battle_record_id
  on public.tenant_battle_records (battle_record_id);

-- ────────────────────────────────────────────────────────────
-- 2) killboard_events (guild_id, discord_id)
--    me-dashboard.ts:117 — 본인 활동 페이지의 길드 내 본인 행 조회.
--    100T 에서 길드당 평균 36K events 가정 시 (guild_id) 단독으로는
--    각 요청마다 36K 행 후필터. 복합 인덱스로 직격 lookup.
-- ────────────────────────────────────────────────────────────
create index if not exists idx_killboard_events_guild_discord
  on public.killboard_events (guild_id, discord_id);

-- ────────────────────────────────────────────────────────────
-- 3) killboard_events (guild_id, occurred_at desc)
--    event-report.ts / leaderboard.ts — 시간창 집계.
--    where guild_id = ? AND occurred_at BETWEEN ? AND ? 가 가장 빈번한 패턴.
--    leaderboard 의 cutoff (최근 30일) 스캔을 인덱스 range scan 으로.
-- ────────────────────────────────────────────────────────────
create index if not exists idx_killboard_events_guild_occurred
  on public.killboard_events (guild_id, occurred_at desc);

comment on index public.idx_tenant_battle_records_battle_record_id is
  'Cross-tenant peer lookup: where battle_record_id = ? (battles.ts:150).';
comment on index public.idx_killboard_events_guild_discord is
  'Per-user dashboard: where guild_id = ? AND discord_id = ? (me-dashboard.ts:117).';
comment on index public.idx_killboard_events_guild_occurred is
  'Time-range aggregation: where guild_id = ? AND occurred_at BETWEEN ... (event-report, leaderboard).';
