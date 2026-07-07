-- 244: Let an event apply its configured video payout rate without video proof.
--
-- The claim ceiling bonus remains tied to an actual video URL. This flag only
-- changes payout-rate resolution for new policy snapshots.

alter table public.events
  add column if not exists regear_video_rate_applies_without_proof boolean not null default false;

alter table public.events
  drop constraint if exists events_regear_video_rate_without_proof_policy_chk;

alter table public.events
  add constraint events_regear_video_rate_without_proof_policy_chk
  check (
    regear_video_rate_applies_without_proof = false
    or regear_video_policy <> 'disabled'
  );

comment on column public.events.regear_video_rate_applies_without_proof is
  'When true, the configured video payout rate applies even without video proof; video claim ceiling bonus still requires proof.';
