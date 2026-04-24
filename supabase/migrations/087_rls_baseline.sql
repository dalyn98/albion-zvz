-- RLS Baseline — defense-in-depth against anon/authenticated client leaks.
--
-- 배경: 모든 server action / page 는 service_role client 를 경유해 DB 를 읽고
-- 쓰기 때문에 RLS 를 건드려도 앱 기능은 변하지 않는다 (service_role 은 RLS 우회).
-- 하지만 과거 코드 경로에 anon supabase client 를 import 한 페이지가 있었고
-- (B2.4 에서 전부 제거), 실수로 다시 anon 경로가 복구되거나 anon key 가 유출될
-- 경우를 대비해 모든 tenant-scoped 및 민감 테이블에 RLS 를 켜둔다.
--
-- 정책은 일부러 비워둔다 → anon/authenticated 는 deny-by-default, service_role 만
-- 우회. Phase 3 에서 per-tenant 세션 클레임 기반 auth client 로 전환할 때 그때
-- policy 를 추가한다.
--
-- 이미 RLS 가 켜진 테이블 (재실행해도 no-op):
--   event_templates(002), role_rewards/regear_requests/point_ledger/exchange_requests(003),
--   guild_avatars(008), donation_requests(034), shop_*(047), killboard_events(049),
--   battles/battle_participants/battle_kill_snapshots(054), shop_baselines(077)

-- ────────────────────────────────────────────────────────────
-- Tenant-scoped (guild_id 있음) — 남은 것들
-- ────────────────────────────────────────────────────────────
alter table public.events             enable row level security;
alter table public.parties            enable row level security;
alter table public.slots              enable row level security;
alter table public.slot_templates     enable row level security;
alter table public.guests             enable row level security;
alter table public.event_guest_tokens enable row level security;
alter table public.app_settings       enable row level security;

-- ────────────────────────────────────────────────────────────
-- tenants — 전역 구성 테이블. member_role_ids / admin_role_ids / event_channel_id
-- 등 민감 정보가 들어있다. anon 으로 tenants 를 조회하면 경쟁 길드의 Discord
-- 역할 매핑이 노출되므로 deny-by-default.
-- ────────────────────────────────────────────────────────────
alter table public.tenants enable row level security;

-- ────────────────────────────────────────────────────────────
-- 전역 전투 기록 (tenant 중립)
-- ────────────────────────────────────────────────────────────
alter table public.battle_records        enable row level security;
alter table public.tenant_battle_records enable row level security;

-- event_battles / opponent_guilds 는 migration 045 에서 드랍됨, push_subscriptions
-- 는 mig 029→030 에서 드랍 후 미복구. 여기서 스킵.
