-- 346: Data-only backfill for the participant-confirmation state introduced by
-- migration 345. Before migration 345, closeout-required event claims could be
-- inserted only after an included closeout entry existed, so every matching
-- historical row is safe to mark confirmed.

update public.regear_requests as request
   set participant_confirmation_status = 'confirmed'
  from public.events as event
 where event.guild_id = request.guild_id
   and event.id = request.event_id
   and event.participation_closeout_required is true
   and exists (
     select 1
     from public.event_participation_closeout_entries as entry
     where entry.guild_id = request.guild_id
       and entry.event_id = request.event_id
       and entry.discord_id = request.discord_id
       and entry.decision = 'included'
   );
