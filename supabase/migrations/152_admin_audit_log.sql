-- 152: 길드 admin (테넌트 본인) 의 mutation 액션 감사 로그.
--
-- 슈퍼어드민(094) 과 분리된 별도 테이블. 슈퍼어드민은 멀티테넌트 운영자(개발자)
-- 라 cross-tenant 액션을 남기지만, 길드 admin 은 본인 길드 내 운영(이벤트 생성/
-- 삭제, 멤버 권한 변경, 리기어 승인/거절, 상점 가격 변경 등) 만 수행하므로
-- guild_id (tenant) 격리가 필수다.
--
-- 적용 후 코드 측 통합 (`src/lib/admin-audit.ts` 의 helper 사용) 은 후속 PR
-- 에서 server action 별로 점진 추가.

-- ─── 감사 로그 ────────────────────────────────────────────────
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  -- 멀티테넌트 격리. 모든 쿼리는 .eq('guild_id', guildId) 로 필터.
  guild_id uuid not null references public.tenants(id) on delete cascade,
  -- 액션을 수행한 admin 의 Discord ID. 비회원/비어드민이 호출하는 경우는
  -- helper 가 차단하므로 항상 admin discord_id 가 들어간다.
  admin_discord_id text not null,
  -- 짧은 식별 문자열. 도메인별 namespace:
  --   'event.create', 'event.delete', 'event.update'
  --   'member.role.grant', 'member.role.revoke'
  --   'regear.approve', 'regear.reject', 'regear.bulk_approve'
  --   'shop.price.update', 'shop.item.add', 'shop.item.remove'
  --   'donation.approve', 'donation.reject'
  --   'settings.update' (sub-section 은 details 에)
  --   'craft.task.assign', 'craft.task.complete'
  action text not null,
  -- 변경 대상 (없으면 null).
  --   target_id: 영향 받은 row 의 PK (event_id / member_id / regear_id 등)
  --   target_kind: target_id 가 가리키는 엔티티 종류 (audit 조회 시 인덱싱용)
  target_id text,
  target_kind text,
  -- 변경 대상이 다른 사용자인 경우 (역할 부여/회수, 리기어 승인 등).
  target_discord_id text,
  -- 변경 전/후, 사유, IP, UA 등 자유 형식.
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 길드 어드민의 본인 행적 / 길드 활동 조회 patterns:
--   (1) 한 길드의 최근 액션 — 어드민 페이지 "활동 로그" 탭
--   (2) 한 admin 의 최근 액션 — 특정 운영자 행적 추적
--   (3) action 종류별 검색 — 'regear.reject' 모두 보고 싶다 등
--   (4) target_discord_id 로 특정 멤버에 대한 액션 — "이 멤버 권한 누가 줬어"
create index if not exists admin_audit_log_guild_idx
  on public.admin_audit_log (guild_id, created_at desc);

create index if not exists admin_audit_log_guild_actor_idx
  on public.admin_audit_log (guild_id, admin_discord_id, created_at desc);

create index if not exists admin_audit_log_guild_action_idx
  on public.admin_audit_log (guild_id, action, created_at desc);

create index if not exists admin_audit_log_target_member_idx
  on public.admin_audit_log (guild_id, target_discord_id, created_at desc)
  where target_discord_id is not null;

comment on table public.admin_audit_log is
  '길드 admin 의 mutation 액션 감사 로그 — guild_id (tenant) 격리, 코드 측 helper(src/lib/admin-audit.ts) 로 자동 기록.';

-- ─── RLS ──────────────────────────────────────────────────────
-- service_role 로만 접근 (어드민 페이지가 service_role 클라이언트 사용).
-- RLS 를 켜되 정책은 추가하지 않아 anon/authenticated 의 직접 읽기를 차단.
alter table public.admin_audit_log enable row level security;
