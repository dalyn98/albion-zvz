-- 277: Privacy-safe workflow outcomes across functional surfaces.

alter table public.ux_events
  drop constraint if exists ux_events_event_type_check;

alter table public.ux_events
  add constraint ux_events_event_type_check check (
    event_type in (
      'surface_view',
      'approval_filter_change',
      'approval_action',
      'detail_toggle',
      'navigation_action',
      'task_started',
      'validation_failed',
      'previewed',
      'submitted',
      'partial_failed',
      'completed',
      'undone',
      'abandoned'
    )
  );

alter table public.ux_events
  drop constraint if exists ux_events_surface_check;

alter table public.ux_events
  add constraint ux_events_surface_check check (
    surface in (
      'admin_approvals',
      'admin_shop',
      'member_home',
      'home_events',
      'event_login',
      'app_navigation',
      'admin_events',
      'admin_tactics',
      'admin_regear',
      'admin_finance',
      'admin_inventory',
      'admin_settings',
      'admin_permissions',
      'admin_operations',
      'member_events',
      'member_regear',
      'shop',
      'craft',
      'battles',
      'stats',
      'members',
      'market',
      'onboarding'
    )
  );

comment on column public.ux_events.event_type is
  'Allowlisted workflow milestone only; authored content and identity are rejected by the API parser.';
