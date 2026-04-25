-- 095: 슈퍼어드민이 부여하는 테넌트별 어드민 오버라이드.
--
-- 일반 admin 권한은 tenants.admin_role_ids 에 등록된 Discord 역할로 결정된다.
-- 그러나 슈퍼어드민이 임시로 특정 길드의 특정 사용자에게 admin 권한을 강제로
-- 부여하거나, 정지된 길드의 어드민을 회수할 필요가 있다 (운영/지원 시나리오).
--
-- 이 테이블은 (tenant_id, discord_id) 한 쌍 당 한 row 가 존재하면 해당 사용자가
-- 그 tenant 에서 admin 으로 취급된다 — 길드 역할이 없어도. 인증 콜백
-- (callback/route.ts) 에서 identityFromMember 의 isAdmin 결과와 OR.
--
-- 회수: row 를 삭제. revoked_at 으로 soft-delete 도 가능하나 이력은 별도
-- super_admin_audit_log 에 남으므로 단순 hard-delete 로 충분.

create table if not exists public.tenant_admin_overrides (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  discord_id text not null,
  granted_by_discord_id text not null,
  granted_at timestamptz not null default now(),
  reason text,
  primary key (tenant_id, discord_id)
);

create index if not exists tenant_admin_overrides_discord_idx
  on public.tenant_admin_overrides (discord_id);

comment on table public.tenant_admin_overrides is
  '슈퍼어드민이 부여한 테넌트별 어드민 오버라이드 — 길드 역할에 의존하지 않음.';

alter table public.tenant_admin_overrides enable row level security;
