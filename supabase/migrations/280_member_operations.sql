-- 280: Member trial lifecycle and explicit availability windows.

create table if not exists public.member_trial_profiles (
  guild_id uuid not null references public.tenants(id) on delete cascade,
  discord_id text not null,
  status text not null,
  started_on date not null,
  review_due_on date not null,
  notes text not null default '',
  resolved_at timestamptz,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guild_id, discord_id),
  foreign key (guild_id, discord_id)
    references public.guild_avatars(guild_id, discord_id)
    on delete cascade,
  constraint member_trial_profiles_status_check check (
    status in ('trial', 'accepted', 'rejected')
  ),
  constraint member_trial_profiles_range_check check (
    review_due_on >= started_on
    and review_due_on <= started_on + 180
  ),
  constraint member_trial_profiles_notes_len check (char_length(notes) <= 500),
  constraint member_trial_profiles_actor_len check (
    length(btrim(updated_by)) > 0 and char_length(updated_by) <= 128
  ),
  constraint member_trial_profiles_resolution_check check (
    (status = 'trial' and resolved_at is null)
    or (status in ('accepted', 'rejected') and resolved_at is not null)
  )
);

create index if not exists member_trial_profiles_review_idx
  on public.member_trial_profiles (guild_id, status, review_due_on);

create table if not exists public.member_absences (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  discord_id text not null,
  starts_on date not null,
  ends_on date not null,
  reason text not null default '',
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (guild_id, discord_id)
    references public.guild_avatars(guild_id, discord_id)
    on delete cascade,
  unique (guild_id, discord_id, starts_on, ends_on),
  constraint member_absences_range_check check (
    ends_on >= starts_on
    and ends_on <= starts_on + 89
  ),
  constraint member_absences_reason_len check (char_length(reason) <= 240),
  constraint member_absences_actor_match check (created_by = discord_id),
  constraint member_absences_actor_len check (
    length(btrim(created_by)) > 0 and char_length(created_by) <= 128
  )
);

create index if not exists member_absences_member_date_idx
  on public.member_absences (guild_id, discord_id, starts_on, ends_on);
create index if not exists member_absences_guild_date_idx
  on public.member_absences (guild_id, starts_on, ends_on);

create or replace function public.save_member_trial(
  p_guild_id uuid,
  p_discord_id text,
  p_status text,
  p_started_on date,
  p_review_due_on date,
  p_notes text,
  p_actor text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Serialize lifecycle transitions with member removal and concurrent edits.
  perform 1
    from public.guild_avatars
   where guild_id = p_guild_id
     and discord_id = p_discord_id
     and withdrawn_at is null
   for update;

  if not found then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  insert into public.member_trial_profiles (
    guild_id,
    discord_id,
    status,
    started_on,
    review_due_on,
    notes,
    resolved_at,
    updated_by
  ) values (
    p_guild_id,
    p_discord_id,
    p_status,
    p_started_on,
    p_review_due_on,
    coalesce(p_notes, ''),
    case when p_status = 'trial' then null else now() end,
    p_actor
  )
  on conflict (guild_id, discord_id) do update set
    status = excluded.status,
    started_on = excluded.started_on,
    review_due_on = excluded.review_due_on,
    notes = excluded.notes,
    resolved_at = case
      when excluded.status = 'trial' then null
      when member_trial_profiles.status = excluded.status
        then member_trial_profiles.resolved_at
      else now()
    end,
    updated_by = excluded.updated_by;
end;
$$;

create or replace function public.create_member_absence(
  p_guild_id uuid,
  p_discord_id text,
  p_starts_on date,
  p_ends_on date,
  p_reason text,
  p_today date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_absence_id uuid;
begin
  -- Serialize all absence writes for one member. This makes the limit and
  -- overlap checks safe even when two tabs submit different ranges together.
  perform 1
    from public.guild_avatars
   where guild_id = p_guild_id
     and discord_id = p_discord_id
     and withdrawn_at is null
   for update;

  if not found then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  if p_today is null or p_ends_on < p_today then
    raise exception 'ABSENCE_RANGE';
  end if;

  if (
    select count(*)
      from public.member_absences
     where guild_id = p_guild_id
       and discord_id = p_discord_id
       and ends_on >= p_today
  ) >= 10 then
    raise exception 'ABSENCE_LIMIT';
  end if;

  if exists (
    select 1
      from public.member_absences
     where guild_id = p_guild_id
       and discord_id = p_discord_id
       and starts_on <= p_ends_on
       and ends_on >= p_starts_on
  ) then
    raise exception 'ABSENCE_OVERLAP';
  end if;

  insert into public.member_absences (
    guild_id,
    discord_id,
    starts_on,
    ends_on,
    reason,
    created_by
  ) values (
    p_guild_id,
    p_discord_id,
    p_starts_on,
    p_ends_on,
    coalesce(p_reason, ''),
    p_discord_id
  )
  returning id into v_absence_id;

  return v_absence_id;
end;
$$;

create or replace function public.set_member_operations_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists member_trial_profiles_updated_at
  on public.member_trial_profiles;
create trigger member_trial_profiles_updated_at
before update on public.member_trial_profiles
for each row execute function public.set_member_operations_updated_at();

drop trigger if exists member_absences_updated_at
  on public.member_absences;
create trigger member_absences_updated_at
before update on public.member_absences
for each row execute function public.set_member_operations_updated_at();

alter table public.member_trial_profiles enable row level security;
alter table public.member_absences enable row level security;

revoke all on public.member_trial_profiles from anon, authenticated;
revoke all on public.member_absences from anon, authenticated;
grant select, insert, update, delete on public.member_trial_profiles to service_role;
grant select, insert, update, delete on public.member_absences to service_role;

revoke all on function public.save_member_trial(uuid, text, text, date, date, text, text)
  from public, anon, authenticated;
grant execute on function public.save_member_trial(uuid, text, text, date, date, text, text)
  to service_role;

revoke all on function public.create_member_absence(uuid, text, date, date, text, date)
  from public, anon, authenticated;
grant execute on function public.create_member_absence(uuid, text, date, date, text, date)
  to service_role;

comment on table public.member_trial_profiles is
  'Tenant-scoped trial review state for active Discord guild members.';
comment on table public.member_absences is
  'Member-authored availability windows used to warn members and event managers.';
comment on function public.save_member_trial(uuid, text, text, date, date, text, text) is
  'Atomically saves a tenant-scoped trial profile while preserving the original resolution timestamp until status changes.';
comment on function public.create_member_absence(uuid, text, date, date, text, date) is
  'Atomically creates one tenant-scoped member absence after locking the member row and enforcing overlap and active-window limits.';
