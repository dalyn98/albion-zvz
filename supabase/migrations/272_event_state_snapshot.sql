-- A live event page previously reloaded its full RSC tree every 45-300 seconds.
-- Return one tenant-scoped fingerprint instead, so the client refreshes the
-- expensive party/build/identity payload only when operational state changed.
create or replace function public.get_event_state_snapshot(
  p_guild_id uuid,
  p_event_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'fingerprint', md5(
      to_jsonb(e)::text ||
      coalesce((
        select jsonb_agg(to_jsonb(p) order by p.party_number, p.id)::text
        from public.parties p
        where p.guild_id = p_guild_id
          and p.event_id = p_event_id
      ), '[]') ||
      coalesce((
        select jsonb_agg(to_jsonb(t) order by t.id)::text
        from public.event_tentative_signups t
        where t.guild_id = p_guild_id
          and t.event_id = p_event_id
      ), '[]') ||
      coalesce((
        select jsonb_agg(to_jsonb(d) order by d.party_number, d.role_type)::text
        from public.event_build_role_demands d
        where d.guild_id = p_guild_id
          and d.event_id = p_event_id
      ), '[]') ||
      coalesce((
        select jsonb_agg(to_jsonb(a) order by a.party_number, a.caller_discord_id)::text
        from public.event_build_party_assigners a
        where a.guild_id = p_guild_id
          and a.event_id = p_event_id
      ), '[]') ||
      coalesce((
        select jsonb_agg(to_jsonb(a) order by a.id)::text
        from public.event_build_applications a
        where a.guild_id = p_guild_id
          and a.event_id = p_event_id
          and a.status <> 'cancelled'
      ), '[]')
    ),
    'battle_started_at', e.battle_started_at,
    'gather_at', e.gather_at
  )
  from public.events e
  where e.guild_id = p_guild_id
    and e.id = p_event_id
    and e.status <> 'draft';
$$;

revoke all on function public.get_event_state_snapshot(uuid, uuid) from public;
revoke all on function public.get_event_state_snapshot(uuid, uuid) from anon, authenticated;
grant execute on function public.get_event_state_snapshot(uuid, uuid) to service_role;
