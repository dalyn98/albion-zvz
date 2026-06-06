-- Add battle-level killbot feed mode and source-key dedupe.
-- Existing event/test deliveries keep their event id identity; battle summaries use
-- source_type='battle' + source_key='<server>:<albion_battle_id>'.

alter table public.killbot_configs
  add column if not exists feed_mode text not null default 'battle';

alter table public.killbot_configs
  drop constraint if exists killbot_configs_feed_mode_chk;

alter table public.killbot_configs
  add constraint killbot_configs_feed_mode_chk
  check (feed_mode in ('event', 'battle', 'both'));

alter table public.killbot_deliveries
  add column if not exists source_type text,
  add column if not exists source_key text;

update public.killbot_deliveries
   set source_type = case when feed_type = 'test' then 'test' else 'event' end
 where source_type is null;

update public.killbot_deliveries
   set source_key = event_id::text
 where source_key is null;

alter table public.killbot_deliveries
  alter column source_type set default 'event',
  alter column source_type set not null,
  alter column source_key set not null;

alter table public.killbot_deliveries
  drop constraint if exists killbot_deliveries_feed_type_check;

alter table public.killbot_deliveries
  add constraint killbot_deliveries_feed_type_check
  check (feed_type in ('kill', 'death', 'battle', 'test'));

alter table public.killbot_deliveries
  drop constraint if exists killbot_deliveries_source_type_check;

alter table public.killbot_deliveries
  add constraint killbot_deliveries_source_type_check
  check (source_type in ('event', 'battle', 'test'));

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'killbot_deliveries_source_unique'
       and conrelid = 'public.killbot_deliveries'::regclass
  ) then
    alter table public.killbot_deliveries
      add constraint killbot_deliveries_source_unique
      unique (guild_id, source_type, source_key, feed_type);
  end if;
end $$;

create index if not exists killbot_deliveries_guild_source_created_idx
  on public.killbot_deliveries (guild_id, source_type, created_at desc);

comment on column public.killbot_configs.feed_mode is
  'Killbot delivery mode: event=per kill/death, battle=one text summary per Albion battle, both=send both feeds.';

comment on column public.killbot_deliveries.source_type is
  'Killbot dedupe source type. battle summaries are keyed independently from Albion event ids.';

comment on column public.killbot_deliveries.source_key is
  'Killbot dedupe source key. For battle summaries this is <server>:<albion_battle_id>.';
