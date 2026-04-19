-- 대문(랜딩) 페이지에서 Discord 로그인 버튼 위에 표시되는 안내 문구. 빈 값이면
-- 애플리케이션 코드의 기본 문구로 폴백하므로, 어드민이 저장해도 비우면 기본 문구가
-- 다시 노출된다.

insert into public.app_settings (key, value) values
  ('landing_cta_text', '')
on conflict (key) do nothing;
