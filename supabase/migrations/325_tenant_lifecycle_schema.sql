-- 325: Explicit tenant suspension and delayed deletion lifecycle.
--
-- Bot removal / inactivity are preservation-only suspensions. Permanent
-- deletion is a separate, explicit 30-day workflow whose audit row survives
-- the tenant purge as a non-restorable tombstone.

set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.tenants
  add column if not exists lifecycle_reason text,
  add column if not exists lifecycle_changed_at timestamptz,
  add column if not exists lifecycle_changed_by text,
  add column if not exists bot_removed_at timestamptz,
  add column if not exists inactivity_warning_at timestamptz,
  add column if not exists deletion_requested_at timestamptz,
  add column if not exists purge_at timestamptz;

alter table public.tenants
  drop constraint if exists tenants_status_check;
alter table public.tenants
  add constraint tenants_status_check
    check (
      status in (
        'pending',
        'active',
        'suspended',
        'deletion_pending',
        'deleted'
      )
    );

alter table public.tenants
  drop constraint if exists tenants_lifecycle_reason_check;
alter table public.tenants
  add constraint tenants_lifecycle_reason_check
    check (
      lifecycle_reason is null
      or lifecycle_reason in (
        'bot_removed',
        'inactive',
        'policy',
        'billing',
        'configuration_incomplete',
        'deletion_requested',
        'legacy'
      )
    );

alter table public.tenants
  drop constraint if exists tenants_deletion_pending_metadata_check;
alter table public.tenants
  add constraint tenants_deletion_pending_metadata_check
    check (
      (
        status = 'deletion_pending'
        and deletion_requested_at is not null
        and purge_at is not null
        and purge_at >= deletion_requested_at + interval '30 days'
      )
      or
      (
        status <> 'deletion_pending'
        and deletion_requested_at is null
        and purge_at is null
      )
    );

create index if not exists tenants_lifecycle_status_idx
  on public.tenants (status, lifecycle_reason, lifecycle_changed_at);
create index if not exists tenants_deletion_due_idx
  on public.tenants (purge_at, id)
  where status = 'deletion_pending';

comment on column public.tenants.lifecycle_reason is
  'Data-preserving tenant lifecycle reason. Bot removal and inactivity never start deletion.';
comment on column public.tenants.purge_at is
  'Earliest irreversible purge time for an explicit deletion request. Null outside deletion_pending.';

create table if not exists public.tenant_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid references public.tenants(id) on delete set null,
  tenant_fingerprint text not null,
  tenant_name_snapshot text not null,
  tenant_slug_snapshot text not null,
  requested_by text,
  request_reason text,
  status text not null default 'pending',
  obligation_snapshot jsonb not null,
  requested_at timestamptz not null default clock_timestamp(),
  purge_at timestamptz not null,
  cancelled_at timestamptz,
  cancelled_by text,
  purge_started_at timestamptz,
  purge_claim_token uuid,
  purge_attempts integer not null default 0,
  purge_last_error text,
  purged_at timestamptz,
  purge_receipt jsonb,
  constraint tenant_deletion_requests_status_check check (
    status in ('pending', 'purging', 'cancelled', 'purged')
  ),
  constraint tenant_deletion_requests_fingerprint_check check (
    tenant_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  constraint tenant_deletion_requests_name_check check (
    length(btrim(tenant_name_snapshot)) between 1 and 200
  ),
  constraint tenant_deletion_requests_slug_check check (
    length(btrim(tenant_slug_snapshot)) between 1 and 200
  ),
  constraint tenant_deletion_requests_reason_check check (
    request_reason is null or char_length(request_reason) <= 500
  ),
  constraint tenant_deletion_requests_snapshot_check check (
    jsonb_typeof(obligation_snapshot) = 'object'
    and octet_length(obligation_snapshot::text) <= 32768
  ),
  constraint tenant_deletion_requests_schedule_check check (
    purge_at >= requested_at + interval '30 days'
  ),
  constraint tenant_deletion_requests_attempts_check check (
    purge_attempts between 0 and 100
  ),
  constraint tenant_deletion_requests_error_check check (
    purge_last_error is null or char_length(purge_last_error) <= 1000
  ),
  constraint tenant_deletion_requests_receipt_check check (
    purge_receipt is null
    or (
      jsonb_typeof(purge_receipt) = 'object'
      and octet_length(purge_receipt::text) <= 32768
    )
  ),
  constraint tenant_deletion_requests_state_check check (
    (
      status = 'pending'
      and cancelled_at is null
      and purged_at is null
      and purge_claim_token is null
    )
    or
    (
      status = 'purging'
      and cancelled_at is null
      and purged_at is null
      and purge_started_at is not null
      and purge_claim_token is not null
    )
    or
    (
      status = 'cancelled'
      and cancelled_at is not null
      and cancelled_by is not null
      and purged_at is null
      and purge_claim_token is null
    )
    or
    (
      status = 'purged'
      and cancelled_at is null
      and purged_at is not null
      and purge_receipt is not null
      and guild_id is null
      and requested_by is null
      and request_reason is null
      and purge_claim_token is null
    )
  )
);

create unique index if not exists tenant_deletion_requests_one_open_per_tenant
  on public.tenant_deletion_requests (guild_id)
  where guild_id is not null and status in ('pending', 'purging');
create index if not exists tenant_deletion_requests_due_idx
  on public.tenant_deletion_requests (purge_at, requested_at, id)
  where status in ('pending', 'purging');
create index if not exists tenant_deletion_requests_tombstone_idx
  on public.tenant_deletion_requests (tenant_fingerprint, purged_at desc)
  where status = 'purged';

alter table public.tenant_deletion_requests enable row level security;
revoke all on public.tenant_deletion_requests
  from public, anon, authenticated, service_role;
grant select on public.tenant_deletion_requests to service_role;

comment on table public.tenant_deletion_requests is
  'Explicit delayed workspace deletion requests. Purged rows retain only a non-restorable receipt and hashed tenant fingerprint.';

notify pgrst, 'reload schema';
