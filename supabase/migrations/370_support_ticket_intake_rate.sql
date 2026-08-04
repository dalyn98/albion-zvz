-- A requester may have only one active ticket (migration 365) and may create
-- at most three tickets per hour. Staff can reopen a prior ticket when a
-- legitimate requester needs continued help.

create or replace function public.enforce_support_ticket_intake_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    select count(*)
      from public.support_tickets as ticket
     where ticket.support_guild_id = new.support_guild_id
       and ticket.opener_discord_id = new.opener_discord_id
       and ticket.created_at > now() - interval '1 hour'
  ) >= 3 then
    raise exception 'support_ticket_rate_limited';
  end if;
  return new;
end;
$$;

create trigger support_ticket_intake_rate_before_insert
before insert on public.support_tickets
for each row execute function public.enforce_support_ticket_intake_rate();
