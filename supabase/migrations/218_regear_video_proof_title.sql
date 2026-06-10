-- Cached public YouTube title for optional regear gameplay proof.
-- Best-effort metadata only; payout logic continues to depend on video_proof_url.

alter table public.regear_requests
  add column if not exists video_proof_title text;

alter table public.regear_requests
  drop constraint if exists regear_requests_video_proof_title_len_chk;

alter table public.regear_requests
  add constraint regear_requests_video_proof_title_len_chk
  check (
    video_proof_title is null
    or char_length(video_proof_title) <= 300
  );

comment on column public.regear_requests.video_proof_title is
  'Cached YouTube video title for the requester-provided gameplay proof URL.';
