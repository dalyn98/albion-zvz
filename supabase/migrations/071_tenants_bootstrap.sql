-- Multi-tenant 전환의 첫 단계: tenants 테이블 생성 + 현재 운영 중인 길드(멘헤라)를
-- tenant #1 로 시드한다. 이 마이그는 기존 기능을 전혀 바꾸지 않는다 — 데이터 모델만
-- "앞으로 multi-tenant 가 되어도 깨지지 않는" 형태로 확장해둘 뿐이다. 쿼리 격리와
-- UI 변경은 Phase 2 / Phase 3 에서 단계적으로 진행한다.
--
-- tenants 컬럼 설계:
-- - id: 내부 참조용 UUID. 다른 테이블의 FK 타겟.
-- - discord_guild_id: Discord 길드 스노우플레이크. 멤버십 확인, 역할 조회, 알림 발송
--   등 Discord API 호출 시 사용. UNIQUE 로 한 길드가 하나의 tenant 에만 매핑되도록.
-- - slug: URL/식별자용 (Phase 3 에서 /[slug]/... 경로가 생길 수 있어 미리 예약).
-- - name: 사람이 읽는 이름 (관리자 UI 표시).
-- - owner_discord_id: 길드장/소유자 Discord ID. Phase 3 의 결제/과금 연결용.
-- - status: 'active' | 'suspended' | 'deleted'. SaaS 결제 상태 표현.
-- - settings: jsonb. 기능 플래그 / 실험 플래그 등 길드 스코프 메타데이터.

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  discord_guild_id text not null unique,
  slug text not null unique,
  name text not null,
  owner_discord_id text,
  status text not null default 'active',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists tenants_discord_guild_id_idx on public.tenants (discord_guild_id);
create index if not exists tenants_slug_idx             on public.tenants (slug);

-- 현재 운영 중인 길드를 tenant #1 로 시드.
-- discord_guild_id 는 .env.local 의 DISCORD_GUILD_ID (1231989392277635102) 와 동일.
-- slug/name 은 초기 임시값이며 Phase 3 온보딩 UI 에서 편집 가능.
insert into public.tenants (discord_guild_id, slug, name, status)
values ('1231989392277635102', 'menhera', '멘헤라', 'active')
on conflict (discord_guild_id) do nothing;
