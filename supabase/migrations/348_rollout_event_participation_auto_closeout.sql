-- 348: Bounded rollout for automatic participation closeout.
--
-- Unstarted events are safe to opt in. Recently ended, still-open events get a
-- fresh six-hour review period from deployment instead of closing immediately.

update public.events
set participation_auto_closeout_enabled = true
where battle_started_at is null;

update public.events as event
set
  participation_auto_closeout_enabled = true,
  participation_auto_closeout_review_started_at = greatest(
    event.operational_ended_at,
    statement_timestamp()
  )
where event.status = 'published'
  and event.participation_closeout_required is true
  and event.operational_ended_at is not null
  and event.operational_ended_at >= statement_timestamp() - interval '24 hours'
  and not exists (
    select 1
    from public.event_participation_closeouts as closeout
    where closeout.guild_id = event.guild_id
      and closeout.event_id = event.id
  )
  and not exists (
    select 1
    from public.event_payout_requests as request
    where request.guild_id = event.guild_id
      and request.event_id = event.id
      and request.status in ('pending', 'approved')
  );
