-- 이벤트 결과(승/패) 및 전투 상세 기록
--
-- 한 이벤트에서 여러 번의 전투가 여러 상대 길드와 벌어질 수 있어
-- 각 전투를 행 단위로 기록하고, 과반수로 이벤트 outcome 을 집계한다.
-- 동수(예: 1승 1패)인 경우 outcome 은 null 로 유지하여 "미확정" 으로 둔다.
--
-- 홈 화면의 3탭 (예정 / 승리 / 패배) 는 events.outcome 컬럼으로 필터한다.

CREATE TABLE IF NOT EXISTS event_battles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  battle_number int NOT NULL CHECK (battle_number >= 1),
  opponent_guild text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('win', 'loss')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, battle_number)
);

CREATE INDEX IF NOT EXISTS event_battles_event_id_idx ON event_battles(event_id);

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS outcome text CHECK (outcome IN ('win', 'loss')),
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz;

CREATE INDEX IF NOT EXISTS events_outcome_idx ON events(outcome);
