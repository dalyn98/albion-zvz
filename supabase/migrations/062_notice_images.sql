-- 페이지 상단 공지(DismissibleNoticeBanner) 에 첨부할 이미지.
-- events(/) 와 regear(/regear) 각각 독립된 슬롯을 가진다.
-- 버킷은 공용(`notice-images`), 경로 prefix 로 용도 구분.

insert into storage.buckets (id, name, public)
  values ('notice-images', 'notice-images', true)
on conflict (id) do nothing;

insert into public.app_settings (key, value) values
  ('events_notice_image_url', ''),
  ('regear_notice_image_url', '')
on conflict (key) do nothing;
