-- 이벤트 생성 알림(공지) 에 첨부할 이미지. 공개 URL 로 Discord embed
-- `image.url` 에 넣어 배너처럼 표시한다. 설정을 비우면 텍스트-only 알림.

insert into storage.buckets (id, name, public)
  values ('notification-images', 'notification-images', true)
on conflict (id) do nothing;

insert into public.app_settings (key, value) values
  ('event_notification_image_url', '')
on conflict (key) do nothing;
