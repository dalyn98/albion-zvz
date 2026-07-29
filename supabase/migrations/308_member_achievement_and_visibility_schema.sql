-- 308: Persist member achievements, separate public leaderboard consent, and
-- reserve a dedicated Menhera content-compliance capability.
--
-- This migration only expands durable state. It does not award achievements;
-- the evaluator and the one-time backfill are separate migrations.

alter table public.account_albion_tenant_links
  add column if not exists public_leaderboard_enabled boolean not null default false,
  add column if not exists public_leaderboard_enabled_at timestamptz;

alter table public.account_albion_tenant_links
  drop constraint if exists account_albion_tenant_links_public_leaderboard_requires_activity;
alter table public.account_albion_tenant_links
  add constraint account_albion_tenant_links_public_leaderboard_requires_activity
    check (not public_leaderboard_enabled or public_activity_enabled);

create index if not exists idx_account_albion_tenant_links_public_leaderboard
  on public.account_albion_tenant_links (guild_id, updated_at desc)
  where public_leaderboard_enabled = true
    and public_activity_enabled = true
    and revoked_at is null;

comment on column public.account_albion_tenant_links.public_leaderboard_enabled is
  '회원이 공개 활동 링크에 개인 성취를 함께 공개하도록 별도로 동의했는지 여부.';


create table if not exists public.member_achievements (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  discord_id text not null,
  achievement_key text not null
    check (achievement_key ~ '^[a-z0-9_]{3,80}$'),
  track text not null check (track in ('team', 'individual')),
  definition_version integer not null check (definition_version > 0),
  evidence_type text not null
    check (evidence_type in ('official_battle', 'official_kill_event')),
  evidence_id text not null check (char_length(evidence_id) between 1 and 160),
  evidence jsonb not null default '{}'::jsonb
    check (jsonb_typeof(evidence) = 'object'),
  earned_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  unique (guild_id, discord_id, achievement_key, evidence_id)
);

create index if not exists idx_member_achievements_member
  on public.member_achievements
    (guild_id, discord_id, earned_at desc, achievement_key);

create index if not exists idx_member_achievements_evidence
  on public.member_achievements
    (guild_id, evidence_type, evidence_id, achievement_key);

alter table public.member_achievements enable row level security;
revoke all on public.member_achievements from public, anon, authenticated;
revoke all on public.member_achievements from service_role;
grant select, insert on public.member_achievements to service_role;

comment on table public.member_achievements is
  '공식 전투 근거로 한 번 획득하면 유지되는 성취 기록. 경제·보급·권한·준수 판정의 입력으로 사용하지 않는다.';


-- Capability bit 35: CONTENT_COMPLIANCE_MANAGE. The previous contract allowed
-- bits 0..34, so both stored masks and the two validating RPCs must expand to
-- bits 0..35 without changing the meaning of any existing bit.
alter table public.permission_role_grants
  drop constraint if exists permission_role_grants_capabilities_check;
alter table public.permission_role_grants
  add constraint permission_role_grants_capabilities_check
    check (capabilities between 1 and 68719476735);

alter table public.permission_user_overrides
  drop constraint if exists permission_user_overrides_capabilities_check;
alter table public.permission_user_overrides
  add constraint permission_user_overrides_capabilities_check
    check (
      capabilities_granted between 0 and 68719476735
      and capabilities_revoked between 0 and 68719476735
      and (capabilities_granted & capabilities_revoked) = 0
    );

do $$
declare
  v_function record;
  v_definition text;
  v_updated integer := 0;
begin
  for v_function in
    select procedure.oid
      from pg_proc procedure
      inner join pg_namespace namespace
        on namespace.oid = procedure.pronamespace
     where namespace.nspname = 'public'
       and procedure.proname in (
         'apply_permission_role_grant',
         'apply_permission_user_override'
       )
  loop
    v_definition := pg_get_functiondef(v_function.oid);
    if position('34359738367' in v_definition) = 0 then
      raise exception 'PERMISSION_CAPABILITY_LIMIT_NOT_FOUND:%', v_function.oid;
    end if;
    execute replace(v_definition, '34359738367', '68719476735');
    v_updated := v_updated + 1;
  end loop;
  if v_updated <> 2 then
    raise exception 'PERMISSION_VALIDATOR_COUNT_MISMATCH:%', v_updated;
  end if;
end;
$$;


create or replace function public.resolve_observed_weapon_category(
  p_item_type text
)
returns text
language sql
immutable
strict
parallel safe
as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        split_part(p_item_type, '@', 1),
        '^T[0-9]+_(2H|MAIN)_',
        ''
      ),
      '_(AVALON|HELL|KEEPER|MORGANA|UNDEAD|CRYSTAL|DEMON)$',
      ''
    ),
    ''
  )
  where split_part(p_item_type, '@', 1) ~ '^T[0-9]+_(2H|MAIN)_.+';
$$;

revoke all on function public.resolve_observed_weapon_category(text)
  from public, anon, authenticated;
grant execute on function public.resolve_observed_weapon_category(text)
  to service_role;

comment on function public.resolve_observed_weapon_category(text) is
  '실제 관측 item type을 티어·인챈트·알려진 artifact suffix가 제거된 무기군으로 정규화한다.';

notify pgrst, 'reload schema';
