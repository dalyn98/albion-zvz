-- 213: SEO acquisition attribution.
--
-- First-touch marketing attribution for public SEO feature pages. The app
-- writes through the service-role client only; no raw IP, user-agent, email,
-- Discord id, or search query is stored here.

create table if not exists public.seo_sessions (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null unique,
  first_landing_path text not null check (char_length(first_landing_path) between 1 and 256),
  first_locale text check (first_locale in ('ko', 'ja', 'en', 'zh')),
  first_feature_slug text check (first_feature_slug is null or char_length(first_feature_slug) between 1 and 64),
  first_referrer_host text check (first_referrer_host is null or char_length(first_referrer_host) <= 160),
  first_source text not null default 'unknown' check (
    first_source in ('google', 'bing', 'naver', 'direct', 'internal', 'referral', 'utm', 'unknown')
  ),
  first_utm jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.seo_events (
  id uuid primary key default gen_random_uuid(),
  seo_session_id uuid not null references public.seo_sessions(id) on delete cascade,
  event_type text not null check (
    event_type in (
      'landing_view',
      'feature_card_click',
      'cta_demo_click',
      'cta_docs_click',
      'cta_bot_install_click',
      'language_switch',
      'discord_oauth_start',
      'bot_install_start'
    )
  ),
  path text not null check (char_length(path) between 1 and 256),
  locale text check (locale in ('ko', 'ja', 'en', 'zh')),
  feature_slug text check (feature_slug is null or char_length(feature_slug) between 1 and 64),
  target text check (target is null or char_length(target) <= 256),
  referrer_host text check (referrer_host is null or char_length(referrer_host) <= 160),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.tenant_acquisition_sources (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  seo_session_id uuid references public.seo_sessions(id) on delete set null,
  first_landing_path text not null check (char_length(first_landing_path) between 1 and 256),
  first_locale text check (first_locale in ('ko', 'ja', 'en', 'zh')),
  first_feature_slug text check (first_feature_slug is null or char_length(first_feature_slug) between 1 and 64),
  first_referrer_host text check (first_referrer_host is null or char_length(first_referrer_host) <= 160),
  first_source text not null check (
    first_source in ('google', 'bing', 'naver', 'direct', 'internal', 'referral', 'utm', 'unknown')
  ),
  first_utm jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now()
);

create index if not exists seo_sessions_created_idx
  on public.seo_sessions (created_at desc);

create index if not exists seo_sessions_feature_created_idx
  on public.seo_sessions (first_feature_slug, created_at desc);

create index if not exists seo_events_session_created_idx
  on public.seo_events (seo_session_id, created_at desc);

create index if not exists seo_events_type_created_idx
  on public.seo_events (event_type, created_at desc);

create index if not exists seo_events_path_created_idx
  on public.seo_events (path, created_at desc);

create index if not exists tenant_acquisition_sources_captured_idx
  on public.tenant_acquisition_sources (captured_at desc);

create index if not exists tenant_acquisition_sources_feature_idx
  on public.tenant_acquisition_sources (first_feature_slug, captured_at desc);

comment on table public.seo_sessions is
  'Anonymous first-touch SEO feature page sessions. No raw IP, user-agent, or query text.';

comment on table public.seo_events is
  'Anonymous SEO funnel events linked to seo_sessions.';

comment on table public.tenant_acquisition_sources is
  'Once-only first-touch SEO attribution snapshots for newly installed tenants.';

alter table public.seo_sessions enable row level security;
alter table public.seo_events enable row level security;
alter table public.tenant_acquisition_sources enable row level security;

revoke all on public.seo_sessions from anon, authenticated;
revoke all on public.seo_events from anon, authenticated;
revoke all on public.tenant_acquisition_sources from anon, authenticated;

grant select, insert, update, delete on public.seo_sessions to service_role;
grant select, insert, update, delete on public.seo_events to service_role;
grant select, insert, update, delete on public.tenant_acquisition_sources to service_role;
