-- Allow killbot individual event logs and battle summaries to use separate
-- Discord channels. channel_id remains as the legacy fallback for older config
-- reads and test sends.

alter table public.killbot_configs
  add column if not exists individual_log_channel_id text,
  add column if not exists battle_summary_channel_id text;

update public.killbot_configs
   set individual_log_channel_id = channel_id
 where individual_log_channel_id is null
   and channel_id is not null
   and feed_mode in ('event', 'both');

update public.killbot_configs
   set battle_summary_channel_id = channel_id
 where battle_summary_channel_id is null
   and channel_id is not null
   and feed_mode in ('battle', 'both');

comment on column public.killbot_configs.individual_log_channel_id is
  'Discord channel for individual kill/death event log notifications.';

comment on column public.killbot_configs.battle_summary_channel_id is
  'Discord channel for battle-level killbot summary notifications.';
