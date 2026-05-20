-- Monthly settlement snapshots built from point_ledger.
-- point_ledger remains the source of truth; settlement_lines freeze a period
-- so later ledger changes do not rewrite past month-end reports.

create table if not exists public.settlement_periods (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (status in ('draft', 'closed')),
  notes text,
  created_by_discord_id text,
  created_by_username text,
  created_at timestamptz not null default now(),
  closed_by_discord_id text,
  closed_by_username text,
  closed_at timestamptz,
  constraint settlement_periods_valid_range check (period_end > period_start),
  constraint settlement_periods_unique_range unique (guild_id, period_start, period_end)
);

create index if not exists settlement_periods_guild_created_idx
  on public.settlement_periods (guild_id, created_at desc);

create index if not exists settlement_periods_guild_status_idx
  on public.settlement_periods (guild_id, status);

create table if not exists public.settlement_lines (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  period_id uuid not null references public.settlement_periods(id) on delete cascade,
  discord_id text not null,
  username text,
  opening_balance integer not null default 0,
  earned integer not null default 0 check (earned >= 0),
  spent integer not null default 0 check (spent >= 0),
  closing_balance integer not null default 0,
  receivable_silver integer not null default 0 check (receivable_silver >= 0),
  payable_silver integer not null default 0 check (payable_silver >= 0),
  ledger_entry_count integer not null default 0 check (ledger_entry_count >= 0),
  source_breakdown jsonb not null default '{}'::jsonb,
  sink_breakdown jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint settlement_lines_balance_projection check (
    closing_balance = opening_balance + earned - spent
    and receivable_silver = greatest(closing_balance, 0)
    and payable_silver = greatest(-closing_balance, 0)
  ),
  constraint settlement_lines_period_user_unique unique (period_id, discord_id)
);

create index if not exists settlement_lines_guild_period_idx
  on public.settlement_lines (guild_id, period_id);

create index if not exists settlement_lines_guild_discord_idx
  on public.settlement_lines (guild_id, discord_id, period_id);

alter table public.settlement_periods enable row level security;
alter table public.settlement_lines enable row level security;

comment on table public.settlement_periods is
  'Guild month-end settlement periods. Lines are point_ledger snapshots at creation time.';

comment on table public.settlement_lines is
  'Per-member settlement snapshot for one period. Positive closing balance is guild payable to member; negative is member payable to guild.';
