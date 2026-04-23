-- 모든 핵심 테이블에 guild_id 컬럼 추가. Phase 1 의 본체. 기존 데이터는 모두
-- tenant #1 (멘헤라) 로 backfill 한다. 쿼리 경로는 아직 건드리지 않으므로 현재
-- 운영 사이트 기능은 일체 변하지 않는다 — Phase 2 에서 server actions 를 하나씩
-- guild_id 필터로 옮긴다.
--
-- 절차 (각 테이블 공통):
--   1) ADD COLUMN guild_id uuid         (nullable, 기존 행은 NULL)
--   2) UPDATE ... SET guild_id = tenant#1.id WHERE guild_id IS NULL  (backfill)
--   3) ALTER COLUMN guild_id SET NOT NULL  (이후 INSERT 는 반드시 guild_id 지정)
--   4) ADD CONSTRAINT ... FOREIGN KEY (guild_id) REFERENCES tenants(id) ON DELETE CASCADE
--   5) CREATE INDEX ... ON ... (guild_id)  (Phase 2 의 빈번한 필터링 대비)
--
-- app_settings 만 특별 케이스: 기존 PK (key) → (guild_id, key) 복합 PK 로 재구성.
-- Phase 2 에서 길드별 설정 분리가 동작하려면 이 PK 가 필수.
--
-- 주의사항:
-- - 자식 테이블 (parties, slots, shop_order_items, event_guest_tokens,
--   killboard_events) 도 guild_id 를 중복 보유한다. JOIN 없이 직접 필터링이
--   가능해 Phase 2 쿼리가 간단해진다.
-- - 자연키 중복 (예: guild_avatars.discord_id, shop_inventory.unique_name) 의
--   cross-tenant 충돌은 Phase 1 에선 발생하지 않는다 (tenant 가 1개뿐). Phase 2
--   에서 PK / UNIQUE 를 (guild_id, natural_key) 복합으로 재구성하면서 해결.

-- 모든 UPDATE 에서 재사용할 tenant #1 UUID 조회용 헬퍼 서브쿼리는 각 문장마다
-- 그대로 반복한다. 행 1개 lookup 이라 비용 무시 가능.

-- ────────────────────────────────────────────────────────────
-- 1. events
-- ────────────────────────────────────────────────────────────
alter table public.events add column if not exists guild_id uuid;
update public.events set guild_id = (select id from public.tenants where discord_guild_id = '1231989392277635102') where guild_id is null;
alter table public.events alter column guild_id set not null;
alter table public.events add constraint events_guild_id_fkey foreign key (guild_id) references public.tenants(id) on delete cascade;
create index if not exists events_guild_id_idx on public.events (guild_id);

-- ────────────────────────────────────────────────────────────
-- 2. parties
-- ────────────────────────────────────────────────────────────
alter table public.parties add column if not exists guild_id uuid;
update public.parties set guild_id = (select id from public.tenants where discord_guild_id = '1231989392277635102') where guild_id is null;
alter table public.parties alter column guild_id set not null;
alter table public.parties add constraint parties_guild_id_fkey foreign key (guild_id) references public.tenants(id) on delete cascade;
create index if not exists parties_guild_id_idx on public.parties (guild_id);

-- ────────────────────────────────────────────────────────────
-- 3. slots
-- ────────────────────────────────────────────────────────────
alter table public.slots add column if not exists guild_id uuid;
update public.slots set guild_id = (select id from public.tenants where discord_guild_id = '1231989392277635102') where guild_id is null;
alter table public.slots alter column guild_id set not null;
alter table public.slots add constraint slots_guild_id_fkey foreign key (guild_id) references public.tenants(id) on delete cascade;
create index if not exists slots_guild_id_idx on public.slots (guild_id);

-- ────────────────────────────────────────────────────────────
-- 4. event_templates
-- ────────────────────────────────────────────────────────────
alter table public.event_templates add column if not exists guild_id uuid;
update public.event_templates set guild_id = (select id from public.tenants where discord_guild_id = '1231989392277635102') where guild_id is null;
alter table public.event_templates alter column guild_id set not null;
alter table public.event_templates add constraint event_templates_guild_id_fkey foreign key (guild_id) references public.tenants(id) on delete cascade;
create index if not exists event_templates_guild_id_idx on public.event_templates (guild_id);

-- ────────────────────────────────────────────────────────────
-- 5. slot_templates
-- ────────────────────────────────────────────────────────────
alter table public.slot_templates add column if not exists guild_id uuid;
update public.slot_templates set guild_id = (select id from public.tenants where discord_guild_id = '1231989392277635102') where guild_id is null;
alter table public.slot_templates alter column guild_id set not null;
alter table public.slot_templates add constraint slot_templates_guild_id_fkey foreign key (guild_id) references public.tenants(id) on delete cascade;
create index if not exists slot_templates_guild_id_idx on public.slot_templates (guild_id);

-- ────────────────────────────────────────────────────────────
-- 6. role_rewards
-- ────────────────────────────────────────────────────────────
alter table public.role_rewards add column if not exists guild_id uuid;
update public.role_rewards set guild_id = (select id from public.tenants where discord_guild_id = '1231989392277635102') where guild_id is null;
alter table public.role_rewards alter column guild_id set not null;
alter table public.role_rewards add constraint role_rewards_guild_id_fkey foreign key (guild_id) references public.tenants(id) on delete cascade;
create index if not exists role_rewards_guild_id_idx on public.role_rewards (guild_id);

-- ────────────────────────────────────────────────────────────
-- 7. regear_requests
-- ────────────────────────────────────────────────────────────
alter table public.regear_requests add column if not exists guild_id uuid;
update public.regear_requests set guild_id = (select id from public.tenants where discord_guild_id = '1231989392277635102') where guild_id is null;
alter table public.regear_requests alter column guild_id set not null;
alter table public.regear_requests add constraint regear_requests_guild_id_fkey foreign key (guild_id) references public.tenants(id) on delete cascade;
create index if not exists regear_requests_guild_id_idx on public.regear_requests (guild_id);

-- ────────────────────────────────────────────────────────────
-- 8. point_ledger
-- ────────────────────────────────────────────────────────────
alter table public.point_ledger add column if not exists guild_id uuid;
update public.point_ledger set guild_id = (select id from public.tenants where discord_guild_id = '1231989392277635102') where guild_id is null;
alter table public.point_ledger alter column guild_id set not null;
alter table public.point_ledger add constraint point_ledger_guild_id_fkey foreign key (guild_id) references public.tenants(id) on delete cascade;
create index if not exists point_ledger_guild_id_idx on public.point_ledger (guild_id);

-- ────────────────────────────────────────────────────────────
-- 9. exchange_requests
-- ────────────────────────────────────────────────────────────
alter table public.exchange_requests add column if not exists guild_id uuid;
update public.exchange_requests set guild_id = (select id from public.tenants where discord_guild_id = '1231989392277635102') where guild_id is null;
alter table public.exchange_requests alter column guild_id set not null;
alter table public.exchange_requests add constraint exchange_requests_guild_id_fkey foreign key (guild_id) references public.tenants(id) on delete cascade;
create index if not exists exchange_requests_guild_id_idx on public.exchange_requests (guild_id);

-- ────────────────────────────────────────────────────────────
-- 10. donation_requests
-- ────────────────────────────────────────────────────────────
alter table public.donation_requests add column if not exists guild_id uuid;
update public.donation_requests set guild_id = (select id from public.tenants where discord_guild_id = '1231989392277635102') where guild_id is null;
alter table public.donation_requests alter column guild_id set not null;
alter table public.donation_requests add constraint donation_requests_guild_id_fkey foreign key (guild_id) references public.tenants(id) on delete cascade;
create index if not exists donation_requests_guild_id_idx on public.donation_requests (guild_id);

-- ────────────────────────────────────────────────────────────
-- 11. guild_avatars
-- ────────────────────────────────────────────────────────────
alter table public.guild_avatars add column if not exists guild_id uuid;
update public.guild_avatars set guild_id = (select id from public.tenants where discord_guild_id = '1231989392277635102') where guild_id is null;
alter table public.guild_avatars alter column guild_id set not null;
alter table public.guild_avatars add constraint guild_avatars_guild_id_fkey foreign key (guild_id) references public.tenants(id) on delete cascade;
create index if not exists guild_avatars_guild_id_idx on public.guild_avatars (guild_id);

-- ────────────────────────────────────────────────────────────
-- 12. guests
-- ────────────────────────────────────────────────────────────
alter table public.guests add column if not exists guild_id uuid;
update public.guests set guild_id = (select id from public.tenants where discord_guild_id = '1231989392277635102') where guild_id is null;
alter table public.guests alter column guild_id set not null;
alter table public.guests add constraint guests_guild_id_fkey foreign key (guild_id) references public.tenants(id) on delete cascade;
create index if not exists guests_guild_id_idx on public.guests (guild_id);

-- ────────────────────────────────────────────────────────────
-- 13. push_subscriptions
-- ────────────────────────────────────────────────────────────
alter table public.push_subscriptions add column if not exists guild_id uuid;
update public.push_subscriptions set guild_id = (select id from public.tenants where discord_guild_id = '1231989392277635102') where guild_id is null;
alter table public.push_subscriptions alter column guild_id set not null;
alter table public.push_subscriptions add constraint push_subscriptions_guild_id_fkey foreign key (guild_id) references public.tenants(id) on delete cascade;
create index if not exists push_subscriptions_guild_id_idx on public.push_subscriptions (guild_id);

-- ────────────────────────────────────────────────────────────
-- 14. shop_inventory
-- ────────────────────────────────────────────────────────────
alter table public.shop_inventory add column if not exists guild_id uuid;
update public.shop_inventory set guild_id = (select id from public.tenants where discord_guild_id = '1231989392277635102') where guild_id is null;
alter table public.shop_inventory alter column guild_id set not null;
alter table public.shop_inventory add constraint shop_inventory_guild_id_fkey foreign key (guild_id) references public.tenants(id) on delete cascade;
create index if not exists shop_inventory_guild_id_idx on public.shop_inventory (guild_id);

-- ────────────────────────────────────────────────────────────
-- 15. shop_chest_logs
-- ────────────────────────────────────────────────────────────
alter table public.shop_chest_logs add column if not exists guild_id uuid;
update public.shop_chest_logs set guild_id = (select id from public.tenants where discord_guild_id = '1231989392277635102') where guild_id is null;
alter table public.shop_chest_logs alter column guild_id set not null;
alter table public.shop_chest_logs add constraint shop_chest_logs_guild_id_fkey foreign key (guild_id) references public.tenants(id) on delete cascade;
create index if not exists shop_chest_logs_guild_id_idx on public.shop_chest_logs (guild_id);

-- ────────────────────────────────────────────────────────────
-- 16. shop_blacklist
-- ────────────────────────────────────────────────────────────
alter table public.shop_blacklist add column if not exists guild_id uuid;
update public.shop_blacklist set guild_id = (select id from public.tenants where discord_guild_id = '1231989392277635102') where guild_id is null;
alter table public.shop_blacklist alter column guild_id set not null;
alter table public.shop_blacklist add constraint shop_blacklist_guild_id_fkey foreign key (guild_id) references public.tenants(id) on delete cascade;
create index if not exists shop_blacklist_guild_id_idx on public.shop_blacklist (guild_id);

-- ────────────────────────────────────────────────────────────
-- 17. shop_name_overrides
-- ────────────────────────────────────────────────────────────
alter table public.shop_name_overrides add column if not exists guild_id uuid;
update public.shop_name_overrides set guild_id = (select id from public.tenants where discord_guild_id = '1231989392277635102') where guild_id is null;
alter table public.shop_name_overrides alter column guild_id set not null;
alter table public.shop_name_overrides add constraint shop_name_overrides_guild_id_fkey foreign key (guild_id) references public.tenants(id) on delete cascade;
create index if not exists shop_name_overrides_guild_id_idx on public.shop_name_overrides (guild_id);

-- ────────────────────────────────────────────────────────────
-- 18. shop_orders
-- ────────────────────────────────────────────────────────────
alter table public.shop_orders add column if not exists guild_id uuid;
update public.shop_orders set guild_id = (select id from public.tenants where discord_guild_id = '1231989392277635102') where guild_id is null;
alter table public.shop_orders alter column guild_id set not null;
alter table public.shop_orders add constraint shop_orders_guild_id_fkey foreign key (guild_id) references public.tenants(id) on delete cascade;
create index if not exists shop_orders_guild_id_idx on public.shop_orders (guild_id);

-- ────────────────────────────────────────────────────────────
-- 19. shop_order_items
-- ────────────────────────────────────────────────────────────
alter table public.shop_order_items add column if not exists guild_id uuid;
update public.shop_order_items set guild_id = (select id from public.tenants where discord_guild_id = '1231989392277635102') where guild_id is null;
alter table public.shop_order_items alter column guild_id set not null;
alter table public.shop_order_items add constraint shop_order_items_guild_id_fkey foreign key (guild_id) references public.tenants(id) on delete cascade;
create index if not exists shop_order_items_guild_id_idx on public.shop_order_items (guild_id);

-- ────────────────────────────────────────────────────────────
-- 20. event_guest_tokens
-- ────────────────────────────────────────────────────────────
alter table public.event_guest_tokens add column if not exists guild_id uuid;
update public.event_guest_tokens set guild_id = (select id from public.tenants where discord_guild_id = '1231989392277635102') where guild_id is null;
alter table public.event_guest_tokens alter column guild_id set not null;
alter table public.event_guest_tokens add constraint event_guest_tokens_guild_id_fkey foreign key (guild_id) references public.tenants(id) on delete cascade;
create index if not exists event_guest_tokens_guild_id_idx on public.event_guest_tokens (guild_id);

-- ────────────────────────────────────────────────────────────
-- 21. killboard_events
-- ────────────────────────────────────────────────────────────
alter table public.killboard_events add column if not exists guild_id uuid;
update public.killboard_events set guild_id = (select id from public.tenants where discord_guild_id = '1231989392277635102') where guild_id is null;
alter table public.killboard_events alter column guild_id set not null;
alter table public.killboard_events add constraint killboard_events_guild_id_fkey foreign key (guild_id) references public.tenants(id) on delete cascade;
create index if not exists killboard_events_guild_id_idx on public.killboard_events (guild_id);

-- ────────────────────────────────────────────────────────────
-- 22. app_settings (PK 재구성: (key) → (guild_id, key))
-- ────────────────────────────────────────────────────────────
-- 기존 PK 를 교체해야 하므로 순서가 중요하다:
--   1) ADD COLUMN guild_id
--   2) backfill
--   3) SET NOT NULL
--   4) DROP old PK (key)
--   5) ADD new PK (guild_id, key)
--   6) FK constraint
alter table public.app_settings add column if not exists guild_id uuid;
update public.app_settings set guild_id = (select id from public.tenants where discord_guild_id = '1231989392277635102') where guild_id is null;
alter table public.app_settings alter column guild_id set not null;
alter table public.app_settings drop constraint if exists app_settings_pkey;
alter table public.app_settings add primary key (guild_id, key);
alter table public.app_settings add constraint app_settings_guild_id_fkey foreign key (guild_id) references public.tenants(id) on delete cascade;
create index if not exists app_settings_guild_id_idx on public.app_settings (guild_id);
