-- 296: Keep participation-video evidence for external Albion participants.
--
-- Participation submissions intentionally allow Discord users who are not
-- registered guild avatars. The table is service-role only, and the standalone
-- upload RPC still requires an active guild avatar, so the unconditional
-- composite foreign key was both unnecessary and incompatible with the
-- participation workflow.

alter table public.member_gameplay_video_uploads
  drop constraint if exists
    member_gameplay_video_uploads_guild_id_discord_id_fkey;

comment on column public.member_gameplay_video_uploads.discord_id is
  'Discord user that supplied the evidence. Participation evidence may belong to an external, unregistered participant; standalone uploads are membership-checked by RPC.';
