-- 219: ZvZ tactics education boards.
--
-- A tactics board is a lightweight guild-scoped document. The heavy editor
-- payload lives per step in `board_state` jsonb and is loaded only by editor /
-- viewer pages, never by list queries.

create table if not exists public.tactic_boards (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  summary text not null default '',
  terrain_type text not null default 'open-field',
  status text not null default 'draft',
  visibility text not null default 'private',
  tags text[] not null default '{}',
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (guild_id, id),
  constraint tactic_boards_title_not_blank check (length(btrim(title)) > 0),
  constraint tactic_boards_title_len check (char_length(title) <= 80),
  constraint tactic_boards_summary_len check (char_length(summary) <= 300),
  constraint tactic_boards_terrain_type_check check (
    terrain_type in ('open-field', 'choke', 'bridge', 'gate', 'castle', 'territory')
  ),
  constraint tactic_boards_status_check check (status in ('draft', 'published', 'archived')),
  constraint tactic_boards_visibility_check check (visibility in ('private', 'guild', 'share'))
);

create index if not exists tactic_boards_guild_updated_idx
  on public.tactic_boards (guild_id, updated_at desc);

create index if not exists tactic_boards_guild_status_updated_idx
  on public.tactic_boards (guild_id, status, updated_at desc);

comment on table public.tactic_boards is
  'Guild-scoped ZvZ tactics education documents. List pages read only metadata.';

create table if not exists public.tactic_steps (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null,
  board_id uuid not null,
  step_order integer not null,
  title text not null,
  callout text not null default '',
  role_callouts jsonb not null default '{}'::jsonb,
  board_state jsonb not null,
  duration_seconds integer not null default 6,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (guild_id, board_id)
    references public.tactic_boards(guild_id, id)
    on delete cascade,
  unique (guild_id, board_id, step_order),
  constraint tactic_steps_order_check check (step_order >= 0 and step_order < 30),
  constraint tactic_steps_title_not_blank check (length(btrim(title)) > 0),
  constraint tactic_steps_title_len check (char_length(title) <= 80),
  constraint tactic_steps_callout_len check (char_length(callout) <= 500),
  constraint tactic_steps_role_callouts_object check (jsonb_typeof(role_callouts) = 'object'),
  constraint tactic_steps_board_state_object check (jsonb_typeof(board_state) = 'object'),
  constraint tactic_steps_board_state_size check (octet_length(board_state::text) <= 524288),
  constraint tactic_steps_duration_check check (duration_seconds between 2 and 60)
);

create index if not exists tactic_steps_board_order_idx
  on public.tactic_steps (guild_id, board_id, step_order);

comment on table public.tactic_steps is
  'Ordered board snapshots for tactics playback. Each step stores one bounded jsonb board_state.';

create table if not exists public.tactic_share_links (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null,
  board_id uuid not null,
  token_hash text not null unique,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  foreign key (guild_id, board_id)
    references public.tactic_boards(guild_id, id)
    on delete cascade,
  constraint tactic_share_links_token_hash_len check (token_hash ~ '^[a-f0-9]{64}$')
);

create index if not exists tactic_share_links_board_active_idx
  on public.tactic_share_links (guild_id, board_id, revoked_at, expires_at);

comment on table public.tactic_share_links is
  'Public tactics share links. Only SHA-256 token hashes are stored; plaintext tokens are returned once.';

alter table public.tactic_boards enable row level security;
alter table public.tactic_steps enable row level security;
alter table public.tactic_share_links enable row level security;

grant select, insert, update, delete on public.tactic_boards to service_role;
grant select, insert, update, delete on public.tactic_steps to service_role;
grant select, insert, update, delete on public.tactic_share_links to service_role;
