-- 297: 공개 길드 프로필의 개인 식별/내부 경제 섹션은 명시적 opt-in 으로만 노출한다.
--
-- 기존에 행이 없는 길드는 애플리케이션 fallback 이 true 였기 때문에 운영진,
-- 개인 기여자, 리기어 집계가 프로필 활성화와 동시에 공개될 수 있었다. 명시적으로
-- 저장된 선택은 보존하고, 값이 없던 경우에만 private 기본값을 기록한다.
insert into public.app_settings (guild_id, key, value, updated_at)
select tenant.id, private_section.key, 'false', now()
  from public.tenants tenant
 cross join (
   values
     ('guild_profile_show_admin_team'),
     ('guild_profile_show_leaderboard'),
     ('guild_profile_show_regear_stats')
 ) as private_section(key)
on conflict (guild_id, key) do nothing;
