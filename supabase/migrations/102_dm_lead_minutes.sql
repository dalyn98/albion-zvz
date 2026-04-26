-- 이벤트 임박 DM 의 발송 시점을 길드 기본값(app_settings.event_dm_lead_minutes,
-- 기본 35분)으로 두되, 개인이 dm_lead_minutes 컬럼으로 override 할 수 있도록
-- 한다. NULL = 길드 기본값을 그대로 따른다.
--
-- 또한 cron 의 중복 발송 방지를 events.imminent_notified_at(이벤트 단위 1회)
-- 에서 (event_id, discord_id) 단위로 옮긴다. 같은 이벤트라도 사람마다 lead
-- 가 다르면 발송 시각이 갈리고, 한 사람 발송 후 다른 사람이 아직 안 받은
-- 상태에서 cron 이 또 돌아야 하기 때문.
--
-- imminent_notified_at 컬럼은 legacy 데이터/이전 events 호환을 위해 그대로
-- 둔다 — 새 cron 로직은 이 값을 읽지 않고 event_dm_sent 만 본다.

ALTER TABLE public.guild_avatars
  ADD COLUMN IF NOT EXISTS dm_lead_minutes integer
  CHECK (dm_lead_minutes IS NULL OR (dm_lead_minutes >= 1 AND dm_lead_minutes <= 1440));

ALTER TABLE public.guests
  ADD COLUMN IF NOT EXISTS dm_lead_minutes integer
  CHECK (dm_lead_minutes IS NULL OR (dm_lead_minutes >= 1 AND dm_lead_minutes <= 1440));

CREATE TABLE IF NOT EXISTS public.event_dm_sent (
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  discord_id text NOT NULL,
  guild_id uuid NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, discord_id)
);

CREATE INDEX IF NOT EXISTS idx_event_dm_sent_event ON public.event_dm_sent(event_id);

-- service-role 만 read/write. 클라이언트에서 직접 노출될 일이 없다.
REVOKE ALL ON public.event_dm_sent FROM anon, authenticated;
