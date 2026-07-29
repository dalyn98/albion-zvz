-- 305: Expand the granular permission model before legacy role settings are
-- projected into it.
--
-- This migration is intentionally schema-only. Migration 306 backfills the
-- nullable columns and role mappings; migration 307 installs the command and
-- projection contract.

alter table public.permission_role_grants
  add column if not exists discord_role_name text;

alter table public.permission_user_overrides
  add column if not exists reason text,
  add column if not exists expires_at timestamptz,
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by_discord_id text,
  add column if not exists revoked_reason text;

create index if not exists permission_user_overrides_active_expiry_idx
  on public.permission_user_overrides (guild_id, expires_at)
  where revoked_at is null;

comment on column public.permission_role_grants.discord_role_name is
  'Discord role name snapshot for the permission UI. The role ID remains the authority.';

comment on column public.permission_user_overrides.reason is
  'Required operational reason for a time-limited emergency capability exception.';

comment on column public.permission_user_overrides.expires_at is
  'Hard expiry. Effective capability resolution ignores the override after this time.';

comment on column public.permission_user_overrides.revoked_at is
  'Explicit early revocation time. Revoked rows are retained for auditability.';
