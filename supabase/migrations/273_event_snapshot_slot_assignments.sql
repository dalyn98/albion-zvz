-- Migration 272 introduced the lightweight event fingerprint, but party
-- slots_version intentionally ignores assignment/request fields. Include the
-- live slot projection explicitly so claims, cancellations, bomb requests,
-- and assigned equipment changes invalidate open event pages.
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
        select jsonb_agg(
          jsonb_build_array(
            s.id,
            s.party_id,
            s.slot_number,
            s.assigned_discord_id,
            s.assigned_username,
            s.assigned_weapon_name,
            s.assigned_weapon_id,
            s.assigned_head_name,
            s.assigned_head_id,
            s.assigned_armor_name,
            s.assigned_armor_id,
            s.assigned_shoes_name,
            s.assigned_shoes_id,
            s.assigned_offhand_name,
            s.assigned_offhand_id,
            s.assigned_potion_name,
            s.assigned_potion_id,
            s.assigned_food_name,
            s.assigned_food_id,
            s.assigned_cape_name,
            s.assigned_cape_id,
            s.assigned_mount_name,
            s.assigned_mount_id,
            s.requested_discord_id,
            s.requested_username,
            s.requested_picks,
            s.requested_at
          ) order by s.party_id, s.slot_number, s.id
        )::text
        from public.slots s
        join public.parties p
          on p.guild_id = s.guild_id
         and p.id = s.party_id
        where s.guild_id = p_guild_id
          and p.guild_id = p_guild_id
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
