-- Roll out the UX refresh only to Menhera. Keep tenant rollout data separate
-- from the schema migration so future tenant enablement remains forward-only.

insert into public.app_settings (guild_id, key, value)
select t.id, 'ux_refresh_v2_enabled', 'true'
from public.tenants t
where t.slug = 'menhera'
on conflict (guild_id, key) do update set value = excluded.value;
