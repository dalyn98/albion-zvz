-- 공개 길드 프로필 (`/g/<slug>`) 자산 저장용 public 버킷.
-- 비로그인 방문자도 봐야 해서 public; 파일 본체는 여기에, 공개 URL 은 app_settings
-- 의 guild_profile_banner_url 행에 기록한다.
insert into storage.buckets (id, name, public)
  values ('guild-profiles', 'guild-profiles', true)
on conflict (id) do nothing;

-- 우리 길드(멘헤라)에만 우선 활성화. 다른 테넌트는 기본 'false' (= app_settings
-- 미설정) 로 두고, 향후 사전 동의 후 SQL/어드민 토글로 전환. 다국어 i18n 화면
-- 도 이 플래그 기반으로 "기능 미활성화" 라벨을 노출.
insert into public.app_settings (guild_id, key, value)
select t.id, 'guild_profile_enabled', 'true'
  from public.tenants t
 where t.slug = 'menhera'
on conflict (guild_id, key) do update set value = excluded.value, updated_at = now();
