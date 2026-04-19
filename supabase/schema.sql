-- Reset (destructive) — run this to migrate from legacy builds/signups model
-- and from the plain-text `assigned_member` model to Discord-identity signups.
-- Order matters: drop children before parents, and drop old RPCs before
-- recreating with new signatures.
DROP FUNCTION IF EXISTS assign_slot(uuid, text);
DROP FUNCTION IF EXISTS assign_slot(uuid, text, text);
DROP FUNCTION IF EXISTS cancel_slot(uuid, text);
DROP FUNCTION IF EXISTS add_signup_safe(uuid, text);
DROP TABLE IF EXISTS signups CASCADE;
DROP TABLE IF EXISTS builds CASCADE;
DROP TABLE IF EXISTS slots CASCADE;
DROP TABLE IF EXISTS parties CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS event_templates CASCADE;

-- Events
-- gather_time is free-form text (e.g. "오늘 저녁 8시"); admin-friendly, no timezone math.
CREATE TABLE events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  gather_time text NOT NULL,
  gather_location text NOT NULL,
  special_notes text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Parties (1–4 per event)
CREATE TABLE parties (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id uuid REFERENCES events(id) ON DELETE CASCADE NOT NULL,
  party_number int NOT NULL CHECK (party_number BETWEEN 1 AND 4),
  UNIQUE(event_id, party_number)
);

-- Slots. Identity is the Discord snowflake; username is denormalized so the
-- UI and listings don't need an extra Discord API call per assignment.
CREATE TABLE slots (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  party_id uuid REFERENCES parties(id) ON DELETE CASCADE NOT NULL,
  slot_number int NOT NULL CHECK (slot_number BETWEEN 1 AND 20),
  role_name text,
  notes text,
  weapon_name text, weapon_id text,
  head_name text,   head_id text,
  armor_name text,  armor_id text,
  shoes_name text,  shoes_id text,
  offhand_name text,offhand_id text,
  potion_name text, potion_id text,
  food_name text,   food_id text,
  cape_name text,   cape_id text,
  assigned_discord_id text,
  assigned_username text,
  UNIQUE(party_id, slot_number)
);

-- Event-scope uniqueness (one slot per event per user) is enforced in the
-- assign_slot RPC with an advisory lock — a simple unique index won't work
-- because slots carry party_id, not event_id. See migrations/001 for
-- provenance.

-- Reusable role+items layouts admin can save from an existing event.
CREATE TABLE event_templates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  data jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE events           ENABLE ROW LEVEL SECURITY;
ALTER TABLE parties          ENABLE ROW LEVEL SECURITY;
ALTER TABLE slots            ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_templates  ENABLE ROW LEVEL SECURITY;

-- Public read; all writes via service role (server actions).
-- event_templates has no anon policies: admin-only, service-role gated.
CREATE POLICY "events_select"  ON events  FOR SELECT TO anon USING (true);
CREATE POLICY "parties_select" ON parties FOR SELECT TO anon USING (true);
CREATE POLICY "slots_select"   ON slots   FOR SELECT TO anon USING (true);

-- Atomic slot assignment: prevents two members grabbing the same slot, and
-- prevents the same Discord user from grabbing two slots in the same event
-- (across any party within that event).
CREATE OR REPLACE FUNCTION assign_slot(
  p_slot_id uuid,
  p_discord_id text,
  p_username text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_party_id uuid;
  v_event_id uuid;
  v_existing text;
BEGIN
  SELECT s.party_id, p.event_id, s.assigned_discord_id
    INTO v_party_id, v_event_id, v_existing
    FROM slots s
    JOIN parties p ON p.id = s.party_id
   WHERE s.id = p_slot_id
     FOR UPDATE OF s;

  IF v_party_id IS NULL THEN
    RAISE EXCEPTION 'SLOT_NOT_FOUND';
  END IF;

  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'SLOT_TAKEN';
  END IF;

  -- Advisory lock keyed on (event_id, discord_id) serializes concurrent
  -- assign_slot calls for the same user in the same event, making the
  -- EXISTS check below race-free.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_event_id::text || ':' || p_discord_id, 0)
  );

  IF EXISTS (
    SELECT 1
      FROM slots s
      JOIN parties p ON p.id = s.party_id
     WHERE p.event_id = v_event_id
       AND s.assigned_discord_id = p_discord_id
  ) THEN
    RAISE EXCEPTION 'ALREADY_IN_EVENT';
  END IF;

  UPDATE slots
     SET assigned_discord_id = p_discord_id,
         assigned_username   = p_username
   WHERE id = p_slot_id;
END;
$$;

-- Atomic cancel: only the Discord user who claimed the slot may cancel it.
-- Admin cancellation goes through a separate service-role path.
CREATE OR REPLACE FUNCTION cancel_slot(
  p_slot_id uuid,
  p_discord_id text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_owner text;
BEGIN
  SELECT assigned_discord_id INTO v_owner
    FROM slots WHERE id = p_slot_id FOR UPDATE;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'SLOT_EMPTY';
  END IF;

  IF v_owner <> p_discord_id THEN
    RAISE EXCEPTION 'NOT_OWNER';
  END IF;

  UPDATE slots
     SET assigned_discord_id = NULL,
         assigned_username   = NULL
   WHERE id = p_slot_id;
END;
$$;
