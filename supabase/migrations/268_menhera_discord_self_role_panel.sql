-- Menhera staged rollout: a tenant-scoped Discord self-role panel.
-- Other tenants stay OFF because the handler requires a valid per-tenant config.
insert into public.app_settings (guild_id, key, value, updated_at)
select
  t.id,
  'discord_self_role_panel_config',
  jsonb_build_object(
    'channelId', '1527633498054066196',
    'title', '기본 역할 선택',
    'description', '아래 버튼을 눌러 역할을 받을 수 있습니다. 여러 역할을 선택할 수 있으며, 초기화 버튼은 이 패널의 역할을 모두 제거합니다.',
    'resetLabel', '초기화',
    'roles', jsonb_build_array(
      jsonb_build_object('id', '1525586411787387051', 'label', 'DPS_Basic'),
      jsonb_build_object('id', '1525586931079974962', 'label', 'Tank_Basic'),
      jsonb_build_object('id', '1525587064496717844', 'label', 'Sup_Basic'),
      jsonb_build_object('id', '1525587169396396223', 'label', 'Heal_Basic')
    )
  )::text,
  now()
from public.tenants as t
where t.slug = 'menhera'
on conflict (guild_id, key)
do update set
  value = excluded.value,
  updated_at = excluded.updated_at;
