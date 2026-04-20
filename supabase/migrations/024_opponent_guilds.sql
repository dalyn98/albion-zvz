-- 상대 길드(Opponent Guild)를 주소록처럼 데이터화
--
-- 기존 event_battles.opponent_guild 는 자유입력 text 였다. 중복/오타로 인해
-- 같은 길드가 서로 다른 행으로 집계돼 "특정 길드 전적" 같은 기능을 만들 수
-- 없었다. 024 부터는 opponent_guilds 테이블에 FK 를 걸고, 기존 텍스트 값을
-- 정규화(trim + 대소문자 보존)해 한 번만 백필한다.
--
-- opponent_guild (text) 컬럼은 표시용 스냅샷으로 유지 — 상대 길드 이름이
-- 바뀌거나 삭제되어도 과거 이벤트 페이지에서는 당시 기록된 이름이 보여야
-- 하므로 FK + snapshot 패턴을 함께 쓴다 (regear_requests.event_title_snapshot
-- 와 같은 규칙).
--
-- 또한 관리자 설정의 날짜 필터(members 상단 승패 합산 범위)를 위해
-- app_settings 에 두 개의 키를 예약만 해둔다. 값이 비어 있으면 "전체"로
-- 해석하는 게 기본 동작이므로 시드 INSERT 는 하지 않는다.

CREATE TABLE IF NOT EXISTS opponent_guilds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- UNIQUE 는 대소문자 무시로 걸어 'MenHera' 와 'menhera' 가 따로 들어가는
-- 사고를 차단. citext 확장을 피하려고 lower() functional index 를 사용.
CREATE UNIQUE INDEX IF NOT EXISTS opponent_guilds_name_lower_idx
  ON opponent_guilds (lower(name));

ALTER TABLE event_battles
  ADD COLUMN IF NOT EXISTS opponent_guild_id uuid
    REFERENCES opponent_guilds(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS event_battles_opponent_guild_id_idx
  ON event_battles(opponent_guild_id);

-- 기존 자유입력 값을 기준으로 opponent_guilds 를 생성하고 FK 를 연결.
-- trim 후 비어있는 경우는 백필하지 않는다 (해당 행은 opponent_guild_id NULL
-- 로 남고, 관리자는 이후 편집 화면에서 길드를 선택해 갱신).
-- DISTINCT ON 으로 대소문자 변형 중 하나만 뽑아 INSERT — 같은 이름의
-- 'MenHera'/'menhera' 가 모두 들어있어도 functional index 충돌이 나지 않는다.
INSERT INTO opponent_guilds (name)
SELECT name FROM (
  SELECT DISTINCT ON (lower(trim(eb.opponent_guild))) trim(eb.opponent_guild) AS name
  FROM event_battles eb
  WHERE eb.opponent_guild IS NOT NULL
    AND trim(eb.opponent_guild) <> ''
  ORDER BY lower(trim(eb.opponent_guild)), trim(eb.opponent_guild)
) src
WHERE NOT EXISTS (
  SELECT 1 FROM opponent_guilds og
  WHERE lower(og.name) = lower(src.name)
);

UPDATE event_battles eb
SET opponent_guild_id = og.id
FROM opponent_guilds og
WHERE og.id IS NOT NULL
  AND lower(og.name) = lower(trim(eb.opponent_guild))
  AND eb.opponent_guild_id IS NULL;
