-- 267: One alliance-content session counts independently for every member who
-- participated in it. The primary key already prevents duplicate links within
-- one member requirement; the guild-wide session uniqueness incorrectly let
-- only the first member create a three-session video duty.
--
-- Forward-only: once shared links exist, restoring this constraint would reject
-- legitimate per-member duties. A rollback must be a new forward migration with
-- an explicit policy for those shared links.

alter table public.alliance_content_video_requirement_sessions
  drop constraint if exists alliance_content_video_requirement_sess_guild_id_session_id_key;

comment on table public.alliance_content_video_requirement_sessions is
  'Links each member video requirement to its counted sessions. A session may count for multiple members, while the primary key prevents duplicate links within one requirement.';
