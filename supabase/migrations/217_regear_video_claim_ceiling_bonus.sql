-- New video-proof claim ceiling policy: add a fixed silver bonus to the
-- base role/event ceiling instead of multiplying it by a percentage.
insert into public.app_settings (guild_id, key, value, updated_at)
select id, 'regear_video_claim_ceiling_bonus_silver', '0', now()
  from public.tenants
on conflict (guild_id, key) do nothing;
