-- 대문(랜딩) 페이지에 표시할 배너 이미지. 로그인하지 않은 방문자도 봐야 하므로
-- public 버킷. 파일 본체는 여기 저장, 공개 URL은 app_settings의
-- landing_banner_url 행에 기록한다. 공란이면 배너 미설정 상태.

insert into storage.buckets (id, name, public)
  values ('landing-banners', 'landing-banners', true)
on conflict (id) do nothing;

insert into public.app_settings (key, value) values
  ('landing_banner_url', '')
on conflict (key) do nothing;
