-- 163: ZvZ 루팅 로그 검증.
--
-- 전투 후 개인별 루팅 CSV 와 길드 금고 입금 로그를 같은 감사 단위(audit)에
-- 보존하고, 누락 의심 항목을 관리자 UI 에서 확인/해결 처리한다.
--
-- 모든 테이블은 guild_id 로 tenant 격리한다. 접근은 service_role 서버 액션을
-- 통해서만 허용하고, anon/authenticated 직접 접근은 RLS 로 차단한다.

create table if not exists public.loot_audits (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  event_id uuid references public.events(id) on delete set null,
  status text not null default 'open'
    check (status in ('open', 'resolved', 'archived')),
  created_by_discord_id text not null,
  created_by_username text not null,
  loot_rows_count integer not null default 0 check (loot_rows_count >= 0),
  deposit_rows_count integer not null default 0 check (deposit_rows_count >= 0),
  total_estimated_value bigint not null default 0 check (total_estimated_value >= 0),
  missing_estimated_value bigint not null default 0 check (missing_estimated_value >= 0),
  unresolved_findings_count integer not null default 0 check (unresolved_findings_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists loot_audits_guild_created_idx
  on public.loot_audits (guild_id, created_at desc);

create index if not exists loot_audits_guild_status_idx
  on public.loot_audits (guild_id, status, created_at desc);

create table if not exists public.loot_audit_loot_rows (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  audit_id uuid not null references public.loot_audits(id) on delete cascade,
  looted_at timestamptz not null,
  looted_by_alliance text not null default '',
  looted_by_guild text not null default '',
  looted_by_name text not null,
  item_id text not null,
  item_name text not null,
  quantity integer not null check (quantity > 0),
  looted_from_alliance text not null default '',
  looted_from_guild text not null default '',
  looted_from_name text not null default '',
  died text not null default '',
  died_player_guild text not null default '',
  killed_by text not null default '',
  killed_by_guild text not null default '',
  estimated_market_value bigint not null default 0 check (estimated_market_value >= 0),
  cluster text not null default '',
  source_line integer not null,
  row_hash text not null,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists loot_audit_loot_rows_dedupe_idx
  on public.loot_audit_loot_rows (guild_id, audit_id, row_hash);

create index if not exists loot_audit_loot_rows_audit_idx
  on public.loot_audit_loot_rows (guild_id, audit_id, looted_by_name);

create table if not exists public.loot_audit_deposit_rows (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  audit_id uuid not null references public.loot_audits(id) on delete cascade,
  deposited_at timestamptz not null,
  player text not null,
  item_name_raw text not null,
  item_id text,
  enchant integer not null default 0 check (enchant >= 0),
  quality integer not null default 1 check (quality >= 0),
  quantity integer not null check (quantity > 0),
  source_line integer not null,
  row_hash text not null,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists loot_audit_deposit_rows_dedupe_idx
  on public.loot_audit_deposit_rows (guild_id, audit_id, row_hash);

create index if not exists loot_audit_deposit_rows_audit_idx
  on public.loot_audit_deposit_rows (guild_id, audit_id, player);

create index if not exists loot_audit_deposit_rows_unresolved_idx
  on public.loot_audit_deposit_rows (guild_id, audit_id)
  where item_id is null;

create table if not exists public.loot_audit_findings (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  audit_id uuid not null references public.loot_audits(id) on delete cascade,
  looted_by_name text not null,
  item_id text not null,
  item_name text not null,
  expected_quantity integer not null check (expected_quantity > 0),
  deposited_quantity integer not null default 0 check (deposited_quantity >= 0),
  missing_quantity integer not null check (missing_quantity > 0),
  unit_estimated_value bigint not null default 0 check (unit_estimated_value >= 0),
  missing_estimated_value bigint not null default 0 check (missing_estimated_value >= 0),
  status text not null default 'open'
    check (status in ('open', 'resolved', 'ignored')),
  resolution_note text,
  resolved_by_discord_id text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists loot_audit_findings_unique_idx
  on public.loot_audit_findings (guild_id, audit_id, looted_by_name, item_id);

create index if not exists loot_audit_findings_audit_status_idx
  on public.loot_audit_findings (guild_id, audit_id, status);

create index if not exists loot_audit_findings_member_idx
  on public.loot_audit_findings (guild_id, audit_id, looted_by_name);

create or replace function public.set_loot_audit_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_loot_audits_updated_at on public.loot_audits;
create trigger set_loot_audits_updated_at
  before update on public.loot_audits
  for each row execute function public.set_loot_audit_updated_at();

drop trigger if exists set_loot_audit_findings_updated_at on public.loot_audit_findings;
create trigger set_loot_audit_findings_updated_at
  before update on public.loot_audit_findings
  for each row execute function public.set_loot_audit_updated_at();

comment on table public.loot_audits is
  'ZvZ 루팅 검증 감사 단위. 개인 루팅 CSV 와 길드 금고 입금 로그를 비교한 결과 요약.';
comment on table public.loot_audit_loot_rows is
  '루팅 로그 CSV 원본 행. item_id 는 로그 프로그램의 Albion UniqueName 을 그대로 보존.';
comment on table public.loot_audit_deposit_rows is
  '길드 금고 입금 로그 행. item_id 가 null 이면 상자 로그 아이템명 resolve 실패.';
comment on table public.loot_audit_findings is
  '루팅 대비 길드 금고 입금 누락 의심 항목. 관리자 확인 후 resolved/ignored 처리.';

alter table public.loot_audits enable row level security;
alter table public.loot_audit_loot_rows enable row level security;
alter table public.loot_audit_deposit_rows enable row level security;
alter table public.loot_audit_findings enable row level security;

revoke all on public.loot_audits from anon, authenticated;
revoke all on public.loot_audit_loot_rows from anon, authenticated;
revoke all on public.loot_audit_deposit_rows from anon, authenticated;
revoke all on public.loot_audit_findings from anon, authenticated;

revoke all on function public.set_loot_audit_updated_at() from public;
revoke all on function public.set_loot_audit_updated_at() from anon, authenticated;
