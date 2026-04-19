-- Re-gear (리기어) support system.
--
-- Guild members who die in large-scale fights get their gear silver subsidized.
-- Flow:
--   1. Member gets slot-assigned to an event (role captured at that point).
--   2. Within 1h of event.gather_time they die; they capture the in-game death log.
--   3. They submit a regear request with that screenshot. Server auto-checks the
--      killboard for a matching death in the time window — result is a hint for
--      the admin, not a hard gate.
--   4. Admin reviews and approves → silver amount (snapshot of role_rewards[role])
--      is credited to the user's point ledger.
--   5. User requests exchange (points → silver). Admin pays in-game, approves →
--      ledger debited.

-- 1) Per-role silver rewards. Admin edits these; regear_requests snapshot the
--    value at request time so later edits don't retroactively change payouts.
CREATE TABLE role_rewards (
  role_name  text PRIMARY KEY,
  silver     integer NOT NULL DEFAULT 0 CHECK (silver >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed with the role labels the app already uses (src/types/index.ts SLOT_ROLES).
INSERT INTO role_rewards (role_name) VALUES
  ('Caller'), ('OffTanker'), ('DefTanker'),
  ('Sup'), ('Healer'), ('Dps'), ('BM'), ('기타');

-- 2) Regear requests. One per (event, user).
CREATE TABLE regear_requests (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id            uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  discord_id          text NOT NULL,
  username            text NOT NULL,
  role_name           text NOT NULL,
  silver              integer NOT NULL CHECK (silver >= 0),   -- snapshot at request time
  screenshot_path     text NOT NULL,                          -- Supabase storage path inside `regear-screenshots`
  killboard_verified  boolean NOT NULL DEFAULT false,
  killboard_event_id  bigint,                                 -- optional: the killboard event id we matched
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_notes         text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  resolved_at         timestamptz,
  UNIQUE (event_id, discord_id)
);

CREATE INDEX regear_requests_status_created ON regear_requests (status, created_at DESC);
CREATE INDEX regear_requests_discord_created ON regear_requests (discord_id, created_at DESC);
CREATE INDEX regear_requests_event ON regear_requests (event_id);

-- 3) Point ledger. User balance = sum(delta) filtered by discord_id.
--    We use an append-only ledger instead of a balance column to keep the
--    approval path atomic (single insert) and auditable.
CREATE TABLE point_ledger (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  discord_id text NOT NULL,
  delta      integer NOT NULL,                               -- +credit, -debit
  reason     text NOT NULL CHECK (reason IN ('regear_approved','exchange_paid','admin_adjust')),
  ref_id     uuid,                                            -- regear_request.id or exchange_request.id
  memo       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX point_ledger_discord_created ON point_ledger (discord_id, created_at DESC);
CREATE INDEX point_ledger_ref ON point_ledger (ref_id);

-- 4) Exchange requests (points → in-game silver).
--    Partial unique index prevents a user from stacking multiple pending requests
--    (which would otherwise let them over-spend their balance via races).
CREATE TABLE exchange_requests (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  discord_id  text NOT NULL,
  username    text NOT NULL,
  silver      integer NOT NULL CHECK (silver > 0),
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_notes text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX exchange_requests_status_created ON exchange_requests (status, created_at DESC);
CREATE INDEX exchange_requests_discord_created ON exchange_requests (discord_id, created_at DESC);
CREATE UNIQUE INDEX exchange_requests_one_pending_per_user
  ON exchange_requests (discord_id) WHERE status = 'pending';

-- 5) RLS — admin-only tables, no anon policies.
ALTER TABLE role_rewards      ENABLE ROW LEVEL SECURITY;
ALTER TABLE regear_requests   ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_ledger      ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_requests ENABLE ROW LEVEL SECURITY;

-- 6) Atomic approval RPCs. These exist because:
--    - Approving a regear = flip status to 'approved' AND insert the ledger row.
--      Racing duplicate clicks must NOT double-credit.
--    - Approving an exchange = check balance >= request.silver AND flip status
--      AND insert negative ledger row. Races must not let a user overdraw.

CREATE OR REPLACE FUNCTION approve_regear_request(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_discord text;
  v_silver  integer;
BEGIN
  -- Lock the row so concurrent approvers serialize.
  SELECT discord_id, silver INTO v_discord, v_silver
    FROM regear_requests
   WHERE id = p_id AND status = 'pending'
   FOR UPDATE;

  IF v_discord IS NULL THEN
    RAISE EXCEPTION 'REGEAR_NOT_PENDING';
  END IF;

  UPDATE regear_requests
     SET status = 'approved', resolved_at = now()
   WHERE id = p_id;

  INSERT INTO point_ledger (discord_id, delta, reason, ref_id)
       VALUES (v_discord, v_silver, 'regear_approved', p_id);
END;
$$;

CREATE OR REPLACE FUNCTION reject_regear_request(p_id uuid, p_notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE regear_requests
     SET status = 'rejected', resolved_at = now(), admin_notes = p_notes
   WHERE id = p_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REGEAR_NOT_PENDING';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION approve_exchange_request(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_discord text;
  v_silver  integer;
  v_balance integer;
BEGIN
  SELECT discord_id, silver INTO v_discord, v_silver
    FROM exchange_requests
   WHERE id = p_id AND status = 'pending'
   FOR UPDATE;

  IF v_discord IS NULL THEN
    RAISE EXCEPTION 'EXCHANGE_NOT_PENDING';
  END IF;

  -- Advisory lock serializes concurrent exchange activity for this user so the
  -- balance check and insert are race-free against another approval or a new
  -- pending request by the same user (partial unique already blocks the latter).
  PERFORM pg_advisory_xact_lock(hashtextextended(v_discord, 0));

  SELECT COALESCE(SUM(delta), 0) INTO v_balance
    FROM point_ledger WHERE discord_id = v_discord;

  IF v_balance < v_silver THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE';
  END IF;

  UPDATE exchange_requests
     SET status = 'approved', resolved_at = now()
   WHERE id = p_id;

  INSERT INTO point_ledger (discord_id, delta, reason, ref_id)
       VALUES (v_discord, -v_silver, 'exchange_paid', p_id);
END;
$$;

CREATE OR REPLACE FUNCTION reject_exchange_request(p_id uuid, p_notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE exchange_requests
     SET status = 'rejected', resolved_at = now(), admin_notes = p_notes
   WHERE id = p_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EXCHANGE_NOT_PENDING';
  END IF;
END;
$$;

-- 7) Storage bucket for death-log screenshots. Run in Supabase Dashboard
--    (Storage → Create bucket) if the statement below can't be executed in
--    the SQL editor:
--      name: regear-screenshots
--      public: false
--      file size limit: 10 MB
--      allowed MIME types: image/png, image/jpeg, image/webp
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('regear-screenshots', 'regear-screenshots', false, 10485760,
        ARRAY['image/png','image/jpeg','image/webp'])
ON CONFLICT (id) DO NOTHING;
