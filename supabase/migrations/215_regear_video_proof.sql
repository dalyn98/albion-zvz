-- Optional YouTube video proof for manual regear requests.
-- Stored value is an app-normalized YouTube embed URL for a single video.

alter table public.regear_requests
  add column if not exists video_proof_url text;

alter table public.regear_requests
  drop constraint if exists regear_requests_video_proof_url_chk;

alter table public.regear_requests
  add constraint regear_requests_video_proof_url_chk
  check (
    video_proof_url is null
    or video_proof_url ~ '^https://www[.]youtube[.]com/embed/[A-Za-z0-9_-]{11}$'
  );

comment on column public.regear_requests.video_proof_url is
  'Sanitized canonical YouTube embed URL attached by the requester as gameplay proof.';

insert into public.app_settings (guild_id, key, value, updated_at)
select id, 'regear_video_payout_rate_percent', '100', now()
from public.tenants
on conflict (guild_id, key) do nothing;
