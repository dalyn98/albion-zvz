-- Menhera-first rollout for the second UI/UX refresh and privacy-safe workflow
-- measurements. Other tenants keep the existing interface until explicitly
-- enabled through app_settings.

create table if not exists public.ux_events (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  flow_id uuid not null,
  actor_kind text not null check (actor_kind in ('admin', 'member', 'guest', 'local')),
  event_type text not null check (
    event_type in (
      'surface_view',
      'approval_filter_change',
      'approval_action',
      'detail_toggle',
      'navigation_action'
    )
  ),
  surface text not null check (
    surface in (
      'admin_approvals',
      'admin_shop',
      'member_home',
      'home_events',
      'event_login',
      'app_navigation'
    )
  ),
  elapsed_ms integer check (elapsed_ms between 0 and 1800000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ux_events_guild_created_idx
  on public.ux_events (guild_id, created_at desc);

create index if not exists ux_events_guild_surface_created_idx
  on public.ux_events (guild_id, surface, created_at desc);

alter table public.ux_events enable row level security;
revoke all on table public.ux_events from public, anon, authenticated;
grant all on table public.ux_events to service_role;

comment on table public.ux_events is
  'Tenant-scoped, allowlisted workflow measurements without member identity or authored content.';
