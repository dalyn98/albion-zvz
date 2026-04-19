-- Key-value settings store for UI-editable strings (Discord notification
-- message, etc.). Kept deliberately simple: one row per key, values are plain
-- text, admins edit them from the dashboard. Not intended for secrets.

create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- Seed the notification message so sendEventNotification has something to
-- read on first deploy. ON CONFLICT DO NOTHING keeps re-runs idempotent.
insert into public.app_settings (key, value) values
  ('event_notification_message', '새 이벤트가 등록되었습니다.')
on conflict (key) do nothing;
