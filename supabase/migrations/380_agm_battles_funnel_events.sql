-- AGM Battles public acquisition funnel events.
-- Paths and targets remain sanitized by the existing attribution service;
-- no raw search query, IP address, user-agent, or Discord id is stored.

alter table public.seo_events
  drop constraint if exists seo_events_event_type_check;

alter table public.seo_events
  add constraint seo_events_event_type_check check (
    event_type in (
      'landing_view',
      'feature_card_click',
      'cta_demo_click',
      'cta_docs_click',
      'cta_bot_install_click',
      'language_switch',
      'discord_oauth_start',
      'bot_install_start',
      'battles_board_view',
      'battles_search',
      'battle_report_open',
      'guild_record_open',
      'alliance_record_open',
      'battle_share',
      'guild_connect'
    )
  ) not valid;

alter table public.seo_events
  validate constraint seo_events_event_type_check;
