-- 214: Google Search Console performance import.
--
-- Aggregated Search Console data is imported by the server-side cron using
-- service-role Supabase access. No visitor ids, raw referrers, IP addresses,
-- user agents, or OAuth tokens are stored here.

create table if not exists public.seo_search_console_sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null check (status in ('running', 'succeeded', 'failed', 'skipped')),
  start_date date,
  end_date date,
  page_rows integer not null default 0 check (page_rows >= 0),
  query_rows integer not null default 0 check (query_rows >= 0),
  inspected_urls integer not null default 0 check (inspected_urls >= 0),
  error text check (error is null or char_length(error) <= 1000),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.seo_search_console_daily_pages (
  date date not null,
  page_path text not null check (char_length(page_path) between 1 and 256),
  locale text check (locale in ('ko', 'ja', 'en', 'zh')),
  feature_slug text check (feature_slug is null or char_length(feature_slug) between 1 and 64),
  clicks integer not null default 0 check (clicks >= 0),
  impressions integer not null default 0 check (impressions >= 0),
  ctr numeric(12, 8) not null default 0 check (ctr >= 0),
  position numeric(12, 4) not null default 0 check (position >= 0),
  updated_at timestamptz not null default now(),
  primary key (date, page_path)
);

create table if not exists public.seo_search_console_daily_queries (
  date date not null,
  page_path text not null check (char_length(page_path) between 1 and 256),
  query text not null check (char_length(query) between 1 and 300),
  country text not null check (country ~ '^[a-z]{3}$'),
  device text not null check (device in ('desktop', 'mobile', 'tablet', 'unknown')),
  locale text check (locale in ('ko', 'ja', 'en', 'zh')),
  feature_slug text check (feature_slug is null or char_length(feature_slug) between 1 and 64),
  clicks integer not null default 0 check (clicks >= 0),
  impressions integer not null default 0 check (impressions >= 0),
  ctr numeric(12, 8) not null default 0 check (ctr >= 0),
  position numeric(12, 4) not null default 0 check (position >= 0),
  updated_at timestamptz not null default now(),
  primary key (date, page_path, query, country, device)
);

create table if not exists public.seo_index_inspections (
  inspected_url text primary key check (char_length(inspected_url) between 1 and 512),
  page_path text not null check (char_length(page_path) between 1 and 256),
  locale text check (locale in ('ko', 'ja', 'en', 'zh')),
  feature_slug text check (feature_slug is null or char_length(feature_slug) between 1 and 64),
  verdict text check (verdict is null or char_length(verdict) <= 80),
  coverage_state text check (coverage_state is null or char_length(coverage_state) <= 200),
  indexing_state text check (indexing_state is null or char_length(indexing_state) <= 80),
  robots_txt_state text check (robots_txt_state is null or char_length(robots_txt_state) <= 80),
  page_fetch_state text check (page_fetch_state is null or char_length(page_fetch_state) <= 80),
  last_crawl_time timestamptz,
  inspected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists seo_search_console_sync_runs_started_idx
  on public.seo_search_console_sync_runs (started_at desc);

create index if not exists seo_search_console_pages_path_date_idx
  on public.seo_search_console_daily_pages (page_path, date desc);

create index if not exists seo_search_console_pages_feature_date_idx
  on public.seo_search_console_daily_pages (feature_slug, date desc);

create index if not exists seo_search_console_queries_query_date_idx
  on public.seo_search_console_daily_queries (query, date desc);

create index if not exists seo_search_console_queries_path_date_idx
  on public.seo_search_console_daily_queries (page_path, date desc);

create index if not exists seo_index_inspections_inspected_at_idx
  on public.seo_index_inspections (inspected_at desc);

comment on table public.seo_search_console_sync_runs is
  'Google Search Console import run audit log. OAuth credentials are never stored.';

comment on table public.seo_search_console_daily_pages is
  'Daily aggregated Search Console page performance.';

comment on table public.seo_search_console_daily_queries is
  'Daily aggregated Search Console query performance for super-admin SEO analysis.';

comment on table public.seo_index_inspections is
  'Latest URL Inspection API status for selected core SEO landing pages.';

alter table public.seo_search_console_sync_runs enable row level security;
alter table public.seo_search_console_daily_pages enable row level security;
alter table public.seo_search_console_daily_queries enable row level security;
alter table public.seo_index_inspections enable row level security;

revoke all on public.seo_search_console_sync_runs from anon, authenticated;
revoke all on public.seo_search_console_daily_pages from anon, authenticated;
revoke all on public.seo_search_console_daily_queries from anon, authenticated;
revoke all on public.seo_index_inspections from anon, authenticated;

grant select, insert, update, delete on public.seo_search_console_sync_runs to service_role;
grant select, insert, update, delete on public.seo_search_console_daily_pages to service_role;
grant select, insert, update, delete on public.seo_search_console_daily_queries to service_role;
grant select, insert, update, delete on public.seo_index_inspections to service_role;
