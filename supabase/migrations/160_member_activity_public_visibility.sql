-- Member-controlled public visibility for guild-specific activity records.
-- Default remains private. Public access is guarded by an unguessable token,
-- not by Discord ID or guild ID.

alter table public.account_albion_tenant_links
  add column if not exists public_activity_enabled boolean not null default false,
  add column if not exists public_activity_enabled_at timestamptz,
  add column if not exists public_activity_token uuid;

update public.account_albion_tenant_links
   set public_activity_token = gen_random_uuid()
 where public_activity_token is null;

alter table public.account_albion_tenant_links
  alter column public_activity_token set default gen_random_uuid(),
  alter column public_activity_token set not null;

create unique index if not exists idx_account_albion_tenant_links_public_token
  on public.account_albion_tenant_links (public_activity_token);

create index if not exists idx_account_albion_tenant_links_public_enabled
  on public.account_albion_tenant_links (public_activity_enabled, updated_at desc)
  where public_activity_enabled = true and revoked_at is null;
