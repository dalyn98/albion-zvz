-- Menhera staged rollout follow-up: role-aligned button colors and English panel copy.
-- Other tenants stay OFF because the handler requires a valid per-tenant config.
insert into public.app_settings (guild_id, key, value, updated_at)
select
  t.id,
  'discord_self_role_panel_config',
  jsonb_build_object(
    'channelId', '1527633498054066196',
    'title', 'Basic Role Selection',
    'description', 'Click a button below to receive a role. You can select multiple roles. The reset button removes all roles assigned through this panel.',
    'resetLabel', '초기화',
    'roles', jsonb_build_array(
      jsonb_build_object('id', '1525586411787387051', 'label', 'DPS_Basic', 'style', 4),
      jsonb_build_object('id', '1525586931079974962', 'label', 'Tank_Basic', 'style', 1),
      jsonb_build_object('id', '1525587064496717844', 'label', 'Sup_Basic', 'style', 2),
      jsonb_build_object('id', '1525587169396396223', 'label', 'Heal_Basic', 'style', 3)
    )
  )::text,
  now()
from public.tenants as t
where t.slug = 'menhera'
on conflict (guild_id, key)
do update set
  value = excluded.value,
  updated_at = excluded.updated_at;
