-- Discord killbot feed settings and delivery dedupe.
-- One config per tenant, one delivery row per Albion event/feed type.

CREATE TABLE IF NOT EXISTS public.killbot_configs (
  guild_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  channel_id text,
  min_fame integer NOT NULL DEFAULT 1 CHECK (min_fame >= 0),
  juicy_fame_threshold integer NOT NULL DEFAULT 1000000 CHECK (juicy_fame_threshold >= 0),
  include_kills boolean NOT NULL DEFAULT true,
  include_deaths boolean NOT NULL DEFAULT true,
  mention_role_id text,
  last_polled_at timestamptz,
  last_sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.killbot_deliveries (
  guild_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_id bigint NOT NULL,
  feed_type text NOT NULL CHECK (feed_type IN ('kill', 'death', 'test')),
  channel_id text NOT NULL,
  discord_message_id text,
  status text NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  error text,
  event_occurred_at timestamptz,
  fame integer NOT NULL DEFAULT 0,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, event_id, feed_type)
);

CREATE INDEX IF NOT EXISTS killbot_deliveries_guild_created_idx
  ON public.killbot_deliveries (guild_id, created_at DESC);

CREATE INDEX IF NOT EXISTS killbot_deliveries_guild_status_created_idx
  ON public.killbot_deliveries (guild_id, status, created_at DESC);

ALTER TABLE public.killbot_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.killbot_deliveries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.killbot_configs FROM anon, authenticated;
REVOKE ALL ON public.killbot_deliveries FROM anon, authenticated;

COMMENT ON TABLE public.killbot_configs IS
  'Per-tenant Discord killbot feed configuration.';
COMMENT ON TABLE public.killbot_deliveries IS
  'Discord killbot delivery ledger and dedupe key for Albion event notifications.';
