-- 094: 슈퍼어드민 (멀티테넌트 운영자) 전용 테이블.
--
-- 슈퍼어드민은 SUPER_ADMIN_DISCORD_IDS env 로 식별되며, 길드 역할에 의존하지
-- 않는다. 이 마이그는 슈퍼어드민이 발행하는 시스템 공지와 감사 로그 테이블을
-- 추가한다. tenants.status 의 enum 은 이미 086 에서 ('pending','active',
-- 'suspended','deleted') 로 충분하므로 변경하지 않는다.
--
-- 별도 admin override 테이블은 phase 2 에서 추가 — 이 마이그는 phase 1 범위.

-- ─── 시스템 공지 ──────────────────────────────────────────────
-- 모든 테넌트의 모든 사용자에게 노출되는 글로벌 공지. 게시판 형태가 아닌
-- 배너 형태로 메인 페이지 상단에 표시. 만료일이 지난 공지는 자동 숨김.
create table if not exists public.super_admin_notices (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  image_url text,
  -- expires_at 이 null 이면 영구 공지. 보통은 며칠~몇 주 후 자동 만료시킨다.
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  created_by_discord_id text not null,
  -- 소프트 아카이브: 만료 전 수동 종료 시 archived_at 을 채운다.
  -- 기록 유지를 위해 row 는 남겨둔다 (감사 트레일).
  archived_at timestamptz
);

create index if not exists super_admin_notices_active_idx
  on public.super_admin_notices (created_at desc)
  where archived_at is null;

comment on table public.super_admin_notices is
  '슈퍼어드민 발행 시스템 공지 — 모든 테넌트 상단 배너에 표시.';

-- ─── 감사 로그 ────────────────────────────────────────────────
-- 슈퍼어드민이 한 모든 mutation (테넌트 상태 변경, 권한 부여, 공지 발행,
-- 임퍼소네이션 시작/종료) 을 기록. 일반 길드 admin 의 액션은 기록하지 않음.
create table if not exists public.super_admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  super_admin_discord_id text not null,
  -- action 은 짧은 식별 문자열: 'tenant.suspend', 'tenant.activate',
  -- 'tenant.archive', 'admin.grant', 'admin.revoke', 'notice.create',
  -- 'notice.archive', 'impersonate.start', 'impersonate.end' 등.
  action text not null,
  -- 영향을 받은 대상 (없으면 null). 둘 다 채울 수도 있음
  -- (예: tenant 의 특정 사용자에 권한 부여).
  target_tenant_id uuid,
  target_discord_id text,
  -- 자유 형식 페이로드 (변경 전/후 값, 메시지 본문 등).
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists super_admin_audit_log_actor_idx
  on public.super_admin_audit_log (super_admin_discord_id, created_at desc);

create index if not exists super_admin_audit_log_tenant_idx
  on public.super_admin_audit_log (target_tenant_id, created_at desc)
  where target_tenant_id is not null;

create index if not exists super_admin_audit_log_action_idx
  on public.super_admin_audit_log (action, created_at desc);

comment on table public.super_admin_audit_log is
  '슈퍼어드민 작업 감사 로그 — 모든 mutation 자동 기록.';

-- ─── RLS ──────────────────────────────────────────────────────
-- 두 테이블은 service_role 로만 접근 (슈퍼어드민 페이지 자체가 service_role
-- 클라이언트 사용). RLS 를 켜되 정책은 추가하지 않아 anon/authenticated 가
-- 직접 읽지 못하게 한다.
alter table public.super_admin_notices enable row level security;
alter table public.super_admin_audit_log enable row level security;
