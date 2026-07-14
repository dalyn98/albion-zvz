-- 260: Track whether alliance-content evidence came from a regear request.
--
-- This is the expand/schema half of the Menhera regear-video bridge. Columns
-- are nullable/defaulted so the existing direct submission path remains live.

create unique index if not exists regear_requests_guild_id_id_uniq
  on public.regear_requests (guild_id, id);

alter table public.alliance_content_video_submissions
  add column if not exists submission_source text not null default 'direct',
  add column if not exists source_regear_request_id uuid;

alter table public.alliance_content_video_submissions
  drop constraint if exists alliance_content_video_submissions_source_chk;

alter table public.alliance_content_video_submissions
  add constraint alliance_content_video_submissions_source_chk
  check (
    (submission_source = 'direct' and source_regear_request_id is null)
    or submission_source = 'regear'
  );

alter table public.alliance_content_video_submissions
  drop constraint if exists alliance_content_video_submissions_regear_source_fk;

alter table public.alliance_content_video_submissions
  add constraint alliance_content_video_submissions_regear_source_fk
  foreign key (guild_id, source_regear_request_id)
  references public.regear_requests(guild_id, id)
  on delete set null (source_regear_request_id);

create unique index if not exists idx_alliance_content_video_submissions_active_regear_source
  on public.alliance_content_video_submissions (guild_id, source_regear_request_id)
  where source_regear_request_id is not null
    and status in ('pending', 'approved');

comment on column public.alliance_content_video_submissions.submission_source is
  'How the member supplied the evidence: direct content-compliance form or a regear request.';
comment on column public.alliance_content_video_submissions.source_regear_request_id is
  'Tenant-scoped regear request that supplied the normalized YouTube proof; nullable after source deletion.';
