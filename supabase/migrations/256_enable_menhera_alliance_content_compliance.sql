-- 256: Stage alliance-content compliance only for the Menhera tenant.
-- Other tenants neither receive the setting nor pass the slug-and-setting gate
-- enforced by every RPC and application route.

insert into public.app_settings (guild_id, key, value, updated_at)
select id, 'alliance_content_compliance_enabled', 'true', now()
from public.tenants
where slug = 'menhera'
on conflict (guild_id, key) do update
  set value = excluded.value,
      updated_at = excluded.updated_at;

insert into public.alliance_content_policies (
  guild_id,
  session_gap_minutes,
  weekly_min_sessions,
  weekly_min_participation_rate,
  video_every_sessions,
  video_due_days,
  updated_at
)
select id, 90, 3, 0, 3, 7, now()
from public.tenants
where slug = 'menhera'
on conflict (guild_id) do nothing;
