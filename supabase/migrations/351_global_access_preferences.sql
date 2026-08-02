-- Release C: personal language and timezone belong to the Discord access
-- identity, not to one guild membership. Guild defaults remain tenant-scoped.

create table if not exists public.global_access_preferences (
  provider text not null check (provider = 'discord'),
  subject text not null check (
    char_length(subject) between 1 and 128
    and subject = btrim(subject)
  ),
  preferred_language text check (
    preferred_language is null
    or preferred_language in ('ko', 'en', 'ja', 'zh')
  ),
  timezone text check (
    timezone is null
    or char_length(timezone) between 1 and 64
  ),
  updated_at timestamptz not null default now(),
  primary key (provider, subject)
);

create table if not exists public.global_access_preference_conflicts (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider = 'discord'),
  subject text not null,
  field_name text not null check (
    field_name in ('preferred_language', 'timezone')
  ),
  observed_values jsonb not null check (
    jsonb_typeof(observed_values) = 'array'
    and jsonb_array_length(observed_values) > 1
  ),
  status text not null default 'unresolved' check (
    status in ('unresolved', 'resolved')
  ),
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  foreign key (provider, subject)
    references public.global_access_preferences(provider, subject)
    on delete cascade
);

create unique index if not exists global_access_preference_open_conflict_idx
  on public.global_access_preference_conflicts (
    provider, subject, field_name
  ) where status = 'unresolved';

alter table public.global_access_preferences enable row level security;
alter table public.global_access_preference_conflicts enable row level security;
revoke all on table public.global_access_preferences
  from public, anon, authenticated, service_role;
revoke all on table public.global_access_preference_conflicts
  from public, anon, authenticated, service_role;
grant select on table public.global_access_preferences to service_role;
grant select on table public.global_access_preference_conflicts to service_role;

with candidates as (
  select
    avatar.discord_id as subject,
    avatar.preferred_language,
    avatar.timezone
  from public.guild_avatars avatar
  union all
  select
    guest.discord_id,
    guest.preferred_language,
    guest.timezone
  from public.guests guest
), grouped as (
  select
    subject,
    case
      when count(distinct preferred_language)
        filter (where preferred_language is not null) = 1
      then min(preferred_language)
        filter (where preferred_language is not null)
      else null
    end as preferred_language,
    case
      when count(distinct timezone)
        filter (where timezone is not null) = 1
      then min(timezone) filter (where timezone is not null)
      else null
    end as timezone
  from candidates
  where nullif(btrim(subject), '') is not null
  group by subject
)
insert into public.global_access_preferences (
  provider, subject, preferred_language, timezone, updated_at
)
select 'discord', subject, preferred_language, timezone, now()
from grouped
on conflict (provider, subject) do nothing;

with values_by_subject as (
  select distinct avatar.discord_id as subject, avatar.preferred_language as value
  from public.guild_avatars avatar
  where avatar.preferred_language is not null
  union
  select distinct guest.discord_id, guest.preferred_language
  from public.guests guest
  where guest.preferred_language is not null
), conflicts as (
  select subject, jsonb_agg(value order by value) as values
  from values_by_subject
  group by subject
  having count(*) > 1
)
insert into public.global_access_preference_conflicts (
  provider, subject, field_name, observed_values
)
select 'discord', subject, 'preferred_language', values
from conflicts
on conflict (provider, subject, field_name)
  where status = 'unresolved'
do nothing;

with values_by_subject as (
  select distinct avatar.discord_id as subject, avatar.timezone as value
  from public.guild_avatars avatar
  where avatar.timezone is not null
  union
  select distinct guest.discord_id, guest.timezone
  from public.guests guest
  where guest.timezone is not null
), conflicts as (
  select subject, jsonb_agg(value order by value) as values
  from values_by_subject
  group by subject
  having count(*) > 1
)
insert into public.global_access_preference_conflicts (
  provider, subject, field_name, observed_values
)
select 'discord', subject, 'timezone', values
from conflicts
on conflict (provider, subject, field_name)
  where status = 'unresolved'
do nothing;

-- Project only unambiguous values. Ambiguous legacy rows remain untouched until
-- the user explicitly chooses a value through the command below.
update public.guild_avatars avatar
set
  preferred_language = coalesce(preference.preferred_language, avatar.preferred_language),
  timezone = coalesce(preference.timezone, avatar.timezone)
from public.global_access_preferences preference
where preference.provider = 'discord'
  and preference.subject = avatar.discord_id
  and (
    avatar.preferred_language is distinct from coalesce(
      preference.preferred_language, avatar.preferred_language
    )
    or avatar.timezone is distinct from coalesce(
      preference.timezone, avatar.timezone
    )
  );

update public.guests guest
set
  preferred_language = coalesce(preference.preferred_language, guest.preferred_language),
  timezone = coalesce(preference.timezone, guest.timezone)
from public.global_access_preferences preference
where preference.provider = 'discord'
  and preference.subject = guest.discord_id
  and (
    guest.preferred_language is distinct from coalesce(
      preference.preferred_language, guest.preferred_language
    )
    or guest.timezone is distinct from coalesce(
      preference.timezone, guest.timezone
    )
  );

create or replace function public.project_global_access_preferences(
  p_subject text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_preference public.global_access_preferences%rowtype;
begin
  select * into v_preference
  from public.global_access_preferences preference
  where preference.provider = 'discord'
    and preference.subject = p_subject;
  if v_preference.subject is null then
    return;
  end if;

  update public.guild_avatars
  set
    preferred_language = v_preference.preferred_language,
    timezone = v_preference.timezone
  where discord_id = p_subject
    and (
      preferred_language is distinct from v_preference.preferred_language
      or timezone is distinct from v_preference.timezone
    );

  update public.guests
  set
    preferred_language = v_preference.preferred_language,
    timezone = v_preference.timezone
  where discord_id = p_subject
    and (
      preferred_language is distinct from v_preference.preferred_language
      or timezone is distinct from v_preference.timezone
    );
end;
$$;

create or replace function public.sync_legacy_global_access_preferences()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.global_access_preferences%rowtype;
  v_language text;
  v_timezone text;
begin
  if pg_trigger_depth() > 1 or nullif(btrim(new.discord_id), '') is null then
    return new;
  end if;

  select * into v_current
  from public.global_access_preferences preference
  where preference.provider = 'discord'
    and preference.subject = new.discord_id
  for update;

  if v_current.subject is null then
    insert into public.global_access_preferences (
      provider, subject, preferred_language, timezone, updated_at
    ) values (
      'discord', new.discord_id, new.preferred_language, new.timezone, now()
    )
    on conflict (provider, subject) do nothing;
  elsif tg_op = 'UPDATE' then
    v_language := case
      when new.preferred_language is distinct from old.preferred_language
        then new.preferred_language
      else v_current.preferred_language
    end;
    v_timezone := case
      when new.timezone is distinct from old.timezone then new.timezone
      else v_current.timezone
    end;
    update public.global_access_preferences
    set
      preferred_language = v_language,
      timezone = v_timezone,
      updated_at = case
        when preferred_language is distinct from v_language
          or timezone is distinct from v_timezone
        then now()
        else updated_at
      end
    where provider = 'discord' and subject = new.discord_id;
  end if;

  perform public.project_global_access_preferences(new.discord_id);
  return new;
end;
$$;

drop trigger if exists guild_avatars_global_access_preferences
  on public.guild_avatars;
create trigger guild_avatars_global_access_preferences
after insert or update of preferred_language, timezone
on public.guild_avatars
for each row execute function public.sync_legacy_global_access_preferences();

drop trigger if exists guests_global_access_preferences
  on public.guests;
create trigger guests_global_access_preferences
after insert or update of preferred_language, timezone
on public.guests
for each row execute function public.sync_legacy_global_access_preferences();

create or replace function public.set_global_access_preferences(
  p_provider text,
  p_subject text,
  p_preferred_language text,
  p_timezone text,
  p_update_language boolean,
  p_update_timezone boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject text := btrim(coalesce(p_subject, ''));
  v_current public.global_access_preferences%rowtype;
  v_language text;
  v_timezone text;
begin
  if p_provider <> 'discord' then
    raise exception 'GLOBAL_PREFERENCE_PROVIDER_UNSUPPORTED';
  end if;
  if char_length(v_subject) not between 1 and 128 then
    raise exception 'GLOBAL_PREFERENCE_SUBJECT_INVALID';
  end if;
  if not coalesce(p_update_language, false)
     and not coalesce(p_update_timezone, false) then
    raise exception 'GLOBAL_PREFERENCE_NO_CHANGE';
  end if;
  if p_update_language and (
    p_preferred_language is null
    or p_preferred_language not in ('ko', 'en', 'ja', 'zh')
  ) then
    raise exception 'GLOBAL_PREFERENCE_LANGUAGE_INVALID';
  end if;
  if p_update_timezone and p_timezone is not null
     and char_length(p_timezone) not between 1 and 64 then
    raise exception 'GLOBAL_PREFERENCE_TIMEZONE_INVALID';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('global-preference:' || p_provider || ':' || v_subject, 0)
  );
  select * into v_current
  from public.global_access_preferences preference
  where preference.provider = p_provider
    and preference.subject = v_subject
  for update;

  v_language := case when p_update_language
    then p_preferred_language
    else v_current.preferred_language
  end;
  v_timezone := case when p_update_timezone
    then p_timezone
    else v_current.timezone
  end;

  insert into public.global_access_preferences (
    provider, subject, preferred_language, timezone, updated_at
  ) values (
    p_provider, v_subject, v_language, v_timezone, now()
  )
  on conflict (provider, subject) do update
  set
    preferred_language = excluded.preferred_language,
    timezone = excluded.timezone,
    updated_at = case
      when public.global_access_preferences.preferred_language
        is distinct from excluded.preferred_language
        or public.global_access_preferences.timezone
        is distinct from excluded.timezone
      then now()
      else public.global_access_preferences.updated_at
    end;

  update public.global_access_preference_conflicts
  set status = 'resolved', resolved_at = now()
  where provider = p_provider
    and subject = v_subject
    and status = 'unresolved'
    and (
      (p_update_language and field_name = 'preferred_language')
      or (p_update_timezone and field_name = 'timezone')
    );

  perform public.project_global_access_preferences(v_subject);
  return jsonb_build_object(
    'preferredLanguage', v_language,
    'timezone', v_timezone
  );
end;
$$;

revoke all on function public.project_global_access_preferences(text)
  from public, anon, authenticated, service_role;
revoke all on function public.sync_legacy_global_access_preferences()
  from public, anon, authenticated, service_role;
revoke all on function public.set_global_access_preferences(
  text, text, text, text, boolean, boolean
) from public, anon, authenticated;
grant execute on function public.set_global_access_preferences(
  text, text, text, text, boolean, boolean
) to service_role;

comment on table public.global_access_preferences is
  'One personal language and timezone per Discord access identity, shared across guild memberships.';
