-- 전투 매치업 분리 기록.
--
-- 배경: 기존 tenant_battle_records 는 (홈 vs 그 외 모든 길드 합산) 단일 행으로
-- 저장. 그러나 한 battle 에 홈 + 적 A연합 + 무관한 소규모 길드들이 같이 잡히면
-- 70 vs 130 처럼 합산값으로 기록되어 "실제 누구와 싸웠는지" 가 흐려진다. 또한
-- 카테고리도 홈 사이즈만 보고 분류해 70 vs 150 (저그) 같은 비대칭 매치업이
-- "large" 로 잘못 라벨링됐다.
--
-- 새 모델:
--   1. mainOpponent = 상대측에서 "가장 큰 단일 알라이언스 (없으면 단일 길드)" 만으로
--      사이즈 산출. 소규모 잔존 길드 (10명 미만) 는 합산 제외.
--   2. 카테고리 = max(home, mainOpp) 기반. 70 vs 150 → zerg.
--   3. 매치업 분리: 홈이 A 연합과 B 연합 모두와 페어 교전(killboard_events 의
--      killer/victim 페어 ≥1) 했으면 두 row 로 분리. 같은 albion_battle_id 의
--      row 는 match_index/match_total 로 묶임.
--   4. provisional: battle 감지 시점엔 killboard_events 가 늦게 들어와 매치업
--      판정 불가. 일단 "__pending__" sentinel 로 저장 → 매 cron 마다 최근 6h 재평가.
--   5. small floor 15 (기존 10) — 갱크/소규모 1:1 분리.
--
-- 기존 데이터: main_opponent_* 컬럼은 일단 '__legacy__' 로 채움. 별도 backfill
-- 스크립트(`backfill_battle_matchups()` RPC) 가 raw_battle + killboard_events
-- 로 재계산해 갱신.

alter table public.tenant_battle_records
  add column if not exists main_opponent_force_key text,
  add column if not exists main_opponent_force_kind text,
  add column if not exists main_opponent_force_name text,
  add column if not exists main_opponent_alliance_id text,
  add column if not exists main_opponent_team_size integer,
  add column if not exists main_opponent_kills integer,
  add column if not exists main_opponent_deaths integer,
  add column if not exists main_opponent_kill_fame bigint,
  add column if not exists match_index integer not null default 1,
  add column if not exists match_total integer not null default 1,
  add column if not exists is_provisional boolean not null default false,
  add column if not exists match_evaluated_at timestamptz;

-- 기존 행 force_key 채움 — backfill 전까지는 "__legacy__" 로 표시.
update public.tenant_battle_records
  set main_opponent_force_key = '__legacy__'
  where main_opponent_force_key is null;

alter table public.tenant_battle_records
  alter column main_opponent_force_key set not null;

-- force_kind 는 backfill 에서 채워짐. legacy 행은 'legacy' 로.
update public.tenant_battle_records
  set main_opponent_force_kind = 'legacy'
  where main_opponent_force_kind is null;

alter table public.tenant_battle_records
  alter column main_opponent_force_kind set not null;

alter table public.tenant_battle_records
  drop constraint if exists tenant_battle_records_force_kind_chk;

alter table public.tenant_battle_records
  add constraint tenant_battle_records_force_kind_chk
  check (main_opponent_force_kind in ('alliance', 'guild', 'pending', 'legacy'));

-- match_index/total CHECK 제약.
alter table public.tenant_battle_records
  drop constraint if exists tenant_battle_records_match_index_chk;
alter table public.tenant_battle_records
  add constraint tenant_battle_records_match_index_chk
  check (match_index >= 1 and match_total >= 1 and match_index <= match_total);

-- 기존 UNIQUE (guild_id, battle_record_id) 제거 → 매치업 분리 허용.
-- 새 UNIQUE: (guild_id, battle_record_id, main_opponent_force_key).
-- legacy 행은 force_key='__legacy__' 로 묶이고 매치업 분리 안 됨 (backfill 후
-- 새 force_key 로 update 되며 분리되면 추가 row insert).
alter table public.tenant_battle_records
  drop constraint if exists tenant_battle_records_guild_id_battle_record_id_key;

alter table public.tenant_battle_records
  add constraint tenant_battle_records_matchup_unique
  unique (guild_id, battle_record_id, main_opponent_force_key);

-- provisional / 재평가 쿼리용 인덱스.
create index if not exists idx_tenant_battle_records_provisional
  on public.tenant_battle_records (guild_id, started_at desc)
  where is_provisional = true;

comment on column public.tenant_battle_records.main_opponent_force_key is
  '주 상대 force 식별자. alliance: ''a:''+alliance_id, guild: ''g:''+guild_id, provisional: ''__pending__'', 마이그 전: ''__legacy__''.';
comment on column public.tenant_battle_records.match_index is
  '같은 battle 의 분리 매치업 순번 (1-based). 단일 매치업이면 1.';
comment on column public.tenant_battle_records.match_total is
  '같은 battle 의 매치업 총 개수. 1 이면 분리 없음.';
comment on column public.tenant_battle_records.is_provisional is
  'true 면 killboard_events 가 늦게 들어와 매치업 판정 미완. cron 재평가에서 확정.';
