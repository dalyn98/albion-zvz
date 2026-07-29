-- 312: Do not rebuild a point-balance projection while its tenant is being
-- deleted. Manual ledger deletion for an existing tenant still updates the
-- projection exactly as before.

create or replace function public.sync_member_point_balance_from_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.apply_member_point_balance_delta(
      new.guild_id,
      new.discord_id,
      new.delta,
      greatest(new.delta, 0),
      greatest(-new.delta, 0),
      1
    );
    return new;
  elsif tg_op = 'UPDATE' then
    perform public.apply_member_point_balance_delta(
      old.guild_id,
      old.discord_id,
      -old.delta,
      case when old.delta > 0 then -old.delta else 0 end,
      case when old.delta < 0 then old.delta else 0 end,
      -1
    );
    perform public.apply_member_point_balance_delta(
      new.guild_id,
      new.discord_id,
      new.delta,
      greatest(new.delta, 0),
      greatest(-new.delta, 0),
      1
    );
    return new;
  elsif tg_op = 'DELETE' then
    if not exists (
      select 1
        from public.tenants tenant
       where tenant.id = old.guild_id
    ) then
      return old;
    end if;

    perform public.apply_member_point_balance_delta(
      old.guild_id,
      old.discord_id,
      -old.delta,
      case when old.delta > 0 then -old.delta else 0 end,
      case when old.delta < 0 then old.delta else 0 end,
      -1
    );
    return old;
  end if;

  return null;
end;
$$;
