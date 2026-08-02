-- 359: Close the remaining public-schema RLS and internal trigger ACL gaps.
--
-- These six tables were introduced after the generic migration 118 RLS sweep.
-- They are internal Albion registry / battle projection stores and every app
-- caller uses the service-role client. Keep them policy-free and service-only:
-- RLS is defense in depth, while the service role retains its existing CRUD.

alter table public.albion_registry_entities enable row level security;
alter table public.albion_registry_entity_names enable row level security;
alter table public.battle_record_snapshots enable row level security;
alter table public.battle_participant_snapshots enable row level security;
alter table public.battle_view_projections enable row level security;
alter table public.battle_projection_diffs enable row level security;

revoke all on table public.albion_registry_entities
  from public, anon, authenticated;
revoke all on table public.albion_registry_entity_names
  from public, anon, authenticated;
revoke all on table public.battle_record_snapshots
  from public, anon, authenticated;
revoke all on table public.battle_participant_snapshots
  from public, anon, authenticated;
revoke all on table public.battle_view_projections
  from public, anon, authenticated;
revoke all on table public.battle_projection_diffs
  from public, anon, authenticated;

grant select, insert, update, delete
  on table public.albion_registry_entities to service_role;
grant select, insert, update, delete
  on table public.albion_registry_entity_names to service_role;
grant select, insert, update, delete
  on table public.battle_record_snapshots to service_role;
grant select, insert, update, delete
  on table public.battle_participant_snapshots to service_role;
grant select, insert, update, delete
  on table public.battle_view_projections to service_role;
grant select, insert, update, delete
  on table public.battle_projection_diffs to service_role;

comment on table public.albion_registry_entities is
  'Service-role-only Albion entity registry. RLS enabled; no browser-facing policies.';
comment on table public.albion_registry_entity_names is
  'Service-role-only Albion entity name history. RLS enabled; no browser-facing policies.';
comment on table public.battle_record_snapshots is
  'Service-role-only battle source snapshots. RLS enabled; no browser-facing policies.';
comment on table public.battle_participant_snapshots is
  'Service-role-only battle participant snapshots. RLS enabled; no browser-facing policies.';
comment on table public.battle_view_projections is
  'Service-role-only battle view projections. RLS enabled; no browser-facing policies.';
comment on table public.battle_projection_diffs is
  'Service-role-only battle projection diagnostics. RLS enabled; no browser-facing policies.';

-- Trigger functions run through their table triggers and never need direct RPC
-- execution. PostgreSQL grants EXECUTE to PUBLIC by default, so explicitly
-- remove that accidental surface from browser roles and service_role alike.
revoke all on function public.capture_event_tentative_snapshot()
  from public, anon, authenticated, service_role;
revoke all on function public.guard_regear_request_policy_snapshot_scope()
  from public, anon, authenticated, service_role;
revoke all on function public.sync_member_gameplay_video_from_participation()
  from public, anon, authenticated, service_role;
revoke all on function public.guard_event_regear_policy_snapshot_insert()
  from public, anon, authenticated, service_role;
revoke all on function public.guard_event_tentative_signup_recruitment()
  from public, anon, authenticated, service_role;
revoke all on function public.guard_event_tentative_snapshot_insert()
  from public, anon, authenticated, service_role;
revoke all on function public.guard_frozen_event_regear_config()
  from public, anon, authenticated, service_role;
revoke all on function public.guard_frozen_event_regear_participants()
  from public, anon, authenticated, service_role;
revoke all on function public.guard_frozen_event_regear_party_inputs()
  from public, anon, authenticated, service_role;
revoke all on function public.guard_frozen_event_regear_role_overrides()
  from public, anon, authenticated, service_role;
revoke all on function public.guard_frozen_event_regear_slot_inputs()
  from public, anon, authenticated, service_role;
revoke all on function public.guard_frozen_regear_window_policy()
  from public, anon, authenticated, service_role;
revoke all on function public.prepare_event_tentative_snapshot()
  from public, anon, authenticated, service_role;
revoke all on function public.set_member_operations_updated_at()
  from public, anon, authenticated, service_role;
revoke all on function public.set_regear_request_origin_type()
  from public, anon, authenticated, service_role;
revoke all on function public.touch_tactic_board_step_revision()
  from public, anon, authenticated, service_role;
revoke all on function public.bump_build_catalog_event_revisions()
  from public, anon, authenticated, service_role;
revoke all on function public.bump_event_revision_from_direct_children()
  from public, anon, authenticated, service_role;
revoke all on function public.bump_event_revision_from_slots()
  from public, anon, authenticated, service_role;
revoke all on function public.bump_event_row_state_revision()
  from public, anon, authenticated, service_role;
revoke all on function public.bump_party_slots_version()
  from public, anon, authenticated, service_role;
revoke all on function public.capture_permission_role_legacy_projection()
  from public, anon, authenticated, service_role;
revoke all on function public.check_solo_bomb_slot()
  from public, anon, authenticated, service_role;
revoke all on function public.cleanup_tentative_on_slot_fill()
  from public, anon, authenticated, service_role;
revoke all on function public.dual_write_account_albion_tenant_link_member_record()
  from public, anon, authenticated, service_role;
revoke all on function public.dual_write_guild_avatar_member_record()
  from public, anon, authenticated, service_role;
revoke all on function public.dual_write_local_guild_account_member_record()
  from public, anon, authenticated, service_role;
revoke all on function public.enforce_regear_craft_task_support_delete()
  from public, anon, authenticated, service_role;
revoke all on function public.enforce_regear_craft_task_support_write()
  from public, anon, authenticated, service_role;
revoke all on function public.enforce_regear_support_delete()
  from public, anon, authenticated, service_role;
revoke all on function public.enforce_regear_support_write()
  from public, anon, authenticated, service_role;
revoke all on function public.normalize_shop_inventory_quality()
  from public, anon, authenticated, service_role;
revoke all on function public.set_build_sheet_recruitment_updated_at()
  from public, anon, authenticated, service_role;
revoke all on function public.set_event_regear_participants_updated_at()
  from public, anon, authenticated, service_role;
revoke all on function public.set_event_tentative_signups_updated_at()
  from public, anon, authenticated, service_role;
revoke all on function public.set_guild_local_accounts_updated_at()
  from public, anon, authenticated, service_role;
revoke all on function public.set_loot_audit_updated_at()
  from public, anon, authenticated, service_role;
revoke all on function public.shop_inventory_delete_when_empty()
  from public, anon, authenticated, service_role;
revoke all on function public.sync_member_point_balance_from_ledger()
  from public, anon, authenticated, service_role;
