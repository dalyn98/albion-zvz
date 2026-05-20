-- 153: granular permission 시스템 (BigInt bitfield).
--
-- 현재 권한 모델은 Discord role → SessionPayload boolean (isAdmin / isMember /
-- canCreateEvents) + guild_avatars 의 is_admin / is_crafter / is_bomb_squad_caller
-- 3개 boolean. all-or-nothing 구조라 "리기어만 승인 가능, 멤버 권한은 못 만짐"
-- 같은 분리가 불가능했다.
--
-- 본 마이그는 capability 비트필드로 granular grant 를 도입한다.
--   (1) permission_role_grants: Discord role id → BIGINT 비트필드 매핑 (per tenant)
--   (2) permission_user_overrides: 특정 Discord user 에 대한 추가 grant / revoke
--       (예: "이 멤버는 role 에 안 묶였지만 chest log 만 paste 가능")
--
-- 기존 isAdmin 게이트는 그대로 살려두고 (legacy fallback), session resolution
-- 시 isAdmin = true 면 ALL_CAPABILITIES 부여. 코드 측 점진 마이그는
-- `session.has(CAP.X)` 체크로 라우트별 전환.
--
-- BIGINT = PostgreSQL int8 = 8 bytes = 63 usable bits (음수 회피). 현재 정의
-- 25개 capability + 향후 #17/#18/#19 capability 합쳐도 30개 미만이라 충분.
-- 부족해지면 capabilities_2 컬럼 추가 또는 numeric 으로 확장.

-- ─── role → capabilities ──────────────────────────────────────
-- "역할 X 를 가진 사람은 capabilities Y 를 가진다." 의 mapping. 어드민이
-- /admin/dashboard/permissions 에서 role 별로 capability checkbox 를 토글.
-- 다른 길드 테이블과 동일 컬럼명 convention 유지 — `guild_id` (uuid, FK tenants.id).
create table if not exists public.permission_role_grants (
  -- 멀티테넌트 격리. 한 Discord role 이 여러 길드에서 쓰일 수 없으니 길드별 PK.
  guild_id uuid not null references public.tenants(id) on delete cascade,
  -- Discord role snowflake (text). tenants.admin_role_ids 와 같은 형식.
  discord_role_id text not null,
  -- 비트필드. 각 비트 = 1 capability. BigInt 직렬화는 코드 측 (`src/lib/permissions.ts`)
  -- 에서 string ↔ BigInt 변환.
  capabilities bigint not null default 0,
  -- 누가, 언제 grant 했는지. updated_at 은 capability 비트 변경마다 갱신.
  granted_by_discord_id text not null,
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 운영 메모 (선택). "갱킹 리더에게 chest log paste 만 허용" 같은 이유.
  notes text not null default '',
  primary key (guild_id, discord_role_id)
);

create index if not exists permission_role_grants_guild_idx
  on public.permission_role_grants (guild_id, updated_at desc);

comment on table public.permission_role_grants is
  '길드별 Discord role → granular capability 비트필드 매핑. session 발급 시 user 의 role 들의 bitwise OR 로 base capabilities 계산.';

-- ─── per-user 추가 grant / revoke ──────────────────────────────
-- role grant 만으로 표현 못하는 예외 사항.
--   capabilities_granted: role 외에 추가로 부여할 비트. (role 없이도 가능)
--   capabilities_revoked: role 로 받은 것을 도로 뺀다. (예: admin role 인데
--     이 사람만 SETTINGS_PERMISSIONS 회수)
-- 적용 순서: final = (sum of role.capabilities) | granted, then & ~revoked.
create table if not exists public.permission_user_overrides (
  guild_id uuid not null references public.tenants(id) on delete cascade,
  -- Discord user snowflake. guild_avatars.discord_id 와 같은 형식.
  discord_id text not null,
  capabilities_granted bigint not null default 0,
  capabilities_revoked bigint not null default 0,
  granted_by_discord_id text not null,
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  notes text not null default '',
  primary key (guild_id, discord_id)
);

create index if not exists permission_user_overrides_guild_idx
  on public.permission_user_overrides (guild_id, updated_at desc);

comment on table public.permission_user_overrides is
  '길드별 특정 user 의 capability 비트필드 가감. role grant 와 OR/AND-NOT 합산 후 session.capabilities 로 직렬화.';

-- ─── RLS ───────────────────────────────────────────────────────
-- service_role 만 접근. anon/authenticated 직접 읽기 차단 (정책 없음 = deny).
-- 모든 application read/write 는 service_role 클라이언트로 통과.
alter table public.permission_role_grants enable row level security;
alter table public.permission_user_overrides enable row level security;
