-- 212: Tenant onboarding telemetry.
--
-- Append-only operational signals used by admin first-run guidance and
-- super-admin stuck diagnostics. The app writes through the service-role
-- client; direct anon/authenticated access remains blocked by RLS.

create table if not exists public.tenant_onboarding_events (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  actor_discord_id text,
  event_type text not null check (
    event_type in (
      'bot_installed',
      'setup_step_saved',
      'setup_completed',
      'admin_dashboard_viewed',
      'member_invite_copied',
      'test_announcement_sent',
      'first_event_created',
      'first_event_published',
      'first_event_notification_sent'
    )
  ),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists tenant_onboarding_events_guild_created_idx
  on public.tenant_onboarding_events (guild_id, created_at desc);

create index if not exists tenant_onboarding_events_type_created_idx
  on public.tenant_onboarding_events (event_type, created_at desc);

create index if not exists tenant_onboarding_events_guild_type_idx
  on public.tenant_onboarding_events (guild_id, event_type, created_at desc);

comment on table public.tenant_onboarding_events is
  'Tenant first-run onboarding telemetry for admin guidance and super-admin stuck diagnostics.';

alter table public.tenant_onboarding_events enable row level security;
