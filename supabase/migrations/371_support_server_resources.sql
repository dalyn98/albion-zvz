-- Versioned, service-only state for the official Discord information hub.
-- Channel and message ids are operational pointers, never user-provided content.

alter table public.support_ticket_settings
  add column resource_channel_ids jsonb not null default '{}'::jsonb,
  add column resource_message_ids jsonb not null default '{}'::jsonb,
  add column resources_version text;

alter table public.support_ticket_settings
  add constraint support_ticket_settings_resource_channel_ids_check
    check (jsonb_typeof(resource_channel_ids) = 'object'),
  add constraint support_ticket_settings_resource_message_ids_check
    check (jsonb_typeof(resource_message_ids) = 'object'),
  add constraint support_ticket_settings_resources_version_check
    check (resources_version is null or char_length(resources_version) between 1 and 80);
