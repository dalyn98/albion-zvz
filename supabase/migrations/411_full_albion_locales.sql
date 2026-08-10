-- 411: Expand persisted UI locales to every language supported by Albion Online.
--
-- Keep this list aligned with src/i18n/locales.ts. Locale identifiers are
-- intentionally BCP 47-shaped because they are also used in public URLs.

do $$
declare
  target record;
  constraint_name text;
begin
  for target in
    select * from (values
      ('guild_avatars', 'preferred_language'),
      ('guests', 'preferred_language'),
      ('event_guest_profiles', 'preferred_language'),
      ('global_access_preferences', 'preferred_language'),
      ('seo_sessions', 'first_locale'),
      ('seo_events', 'locale'),
      ('tenant_acquisition_sources', 'first_locale'),
      ('seo_search_console_daily_pages', 'locale'),
      ('seo_search_console_daily_queries', 'locale'),
      ('seo_index_inspections', 'locale'),
      ('support_tickets', 'opener_locale')
    ) as locale_column(table_name, column_name)
  loop
    for constraint_name in
      select constraint_row.conname
        from pg_constraint as constraint_row
       where constraint_row.conrelid = format('public.%I', target.table_name)::regclass
         and constraint_row.contype = 'c'
         and pg_get_constraintdef(constraint_row.oid) ilike
           '%' || target.column_name || '%'
    loop
      execute format(
        'alter table public.%I drop constraint %I',
        target.table_name,
        constraint_name
      );
    end loop;

    execute format(
      'alter table public.%I add constraint %I check (%I in (' ||
      quote_literal('ko') || ', ' || quote_literal('ja') || ', ' ||
      quote_literal('en') || ', ' || quote_literal('zh') || ', ' ||
      quote_literal('zh-Hant') || ', ' || quote_literal('fr') || ', ' ||
      quote_literal('de') || ', ' || quote_literal('es-ES') || ', ' ||
      quote_literal('es-419') || ', ' || quote_literal('pt-BR') || ', ' ||
      quote_literal('pt-PT') || ', ' || quote_literal('pl') || ', ' ||
      quote_literal('ru') || ', ' || quote_literal('it') || ', ' ||
      quote_literal('id') || ', ' || quote_literal('ar') || ', ' ||
      quote_literal('tr') || '))',
      target.table_name,
      target.table_name || '_' || target.column_name || '_check',
      target.column_name
    );
  end loop;
end;
$$;

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
    or p_preferred_language not in (
      'ko', 'ja', 'en', 'zh', 'zh-Hant', 'fr', 'de', 'es-ES', 'es-419',
      'pt-BR', 'pt-PT', 'pl', 'ru', 'it', 'id', 'ar', 'tr'
    )
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

create or replace function public.reserve_support_ticket(
  p_support_guild_id text,
  p_opener_discord_id text,
  p_opener_name text,
  p_opener_locale text,
  p_related_tenant_id uuid,
  p_related_guild_hint text,
  p_category text,
  p_subject text,
  p_description text,
  p_interaction_id text
) returns public.support_tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.support_tickets;
begin
  if p_support_guild_id !~ '^[0-9]{5,30}$'
     or p_opener_discord_id !~ '^[0-9]{5,30}$'
     or p_interaction_id !~ '^[0-9]{5,30}$'
     or p_opener_locale not in (
       'ko', 'ja', 'en', 'zh', 'zh-Hant', 'fr', 'de', 'es-ES', 'es-419',
       'pt-BR', 'pt-PT', 'pl', 'ru', 'it', 'id', 'ar', 'tr'
     )
     or p_category not in ('account', 'bot', 'battle', 'regear_shop', 'billing', 'bug', 'other')
     or char_length(btrim(coalesce(p_opener_name, ''))) not between 1 and 80
     or char_length(btrim(coalesce(p_subject, ''))) not between 1 and 100
     or char_length(btrim(coalesce(p_description, ''))) not between 1 and 1500
     or (
       p_related_guild_hint is not null
       and char_length(btrim(p_related_guild_hint)) not between 1 and 100
     ) then
    raise exception 'invalid_support_ticket_input';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_support_guild_id || ':support-ticket:' || p_opener_discord_id, 0)
  );

  select ticket.* into v_ticket
    from public.support_tickets as ticket
   where ticket.create_interaction_id = p_interaction_id;
  if found then
    return v_ticket;
  end if;

  select ticket.* into v_ticket
    from public.support_tickets as ticket
   where ticket.support_guild_id = p_support_guild_id
     and ticket.opener_discord_id = p_opener_discord_id
     and ticket.status in (
       'provisioning', 'open', 'in_progress', 'waiting_requester', 'resolved'
     )
   order by ticket.created_at desc
   limit 1;
  if found then
    return v_ticket;
  end if;

  insert into public.support_tickets (
    support_guild_id,
    opener_discord_id,
    opener_name_snapshot,
    opener_locale,
    related_tenant_id,
    related_guild_hint,
    category,
    subject,
    description,
    create_interaction_id
  ) values (
    p_support_guild_id,
    p_opener_discord_id,
    btrim(p_opener_name),
    p_opener_locale,
    p_related_tenant_id,
    nullif(btrim(p_related_guild_hint), ''),
    p_category,
    btrim(p_subject),
    btrim(p_description),
    p_interaction_id
  )
  returning * into v_ticket;

  insert into public.support_ticket_events (
    ticket_id, interaction_id, event_type, actor_kind,
    actor_discord_id, previous_status, new_status
  ) values (
    v_ticket.id, p_interaction_id, 'ticket.reserved', 'requester',
    p_opener_discord_id, null, 'provisioning'
  );

  return v_ticket;
end;
$$;

-- CREATE OR REPLACE preserves existing function ACLs, but keep the intended
-- service-only boundary explicit for clean installs and future audits.
revoke all on function public.set_global_access_preferences(
  text, text, text, text, boolean, boolean
) from public, anon, authenticated;
grant execute on function public.set_global_access_preferences(
  text, text, text, text, boolean, boolean
) to service_role;

revoke all on function public.reserve_support_ticket(
  text, text, text, text, uuid, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.reserve_support_ticket(
  text, text, text, text, uuid, text, text, text, text, text
) to service_role;
