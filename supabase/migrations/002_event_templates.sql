-- Event templates: save role + items layout of an existing event for reuse.
-- Admin-only — no anon SELECT policy; writes/reads go through service role.

CREATE TABLE IF NOT EXISTS event_templates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  -- { parties: [{ party_number, slots: [{ slot_number, role_name, notes,
  --   weapon_name, weapon_id, head_name, head_id, ... (all 8 gear slots) }] }] }
  data jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE event_templates ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: only service-role (server actions gated by
-- requireAdmin) may read or write.
