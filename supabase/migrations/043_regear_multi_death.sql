-- Allow multiple regear requests per user per event (configurable cap).
--
-- Previously 026_regear_reapply_after_reject.sql installed a partial unique
-- index on (event_id, discord_id) WHERE status <> 'rejected', enforcing at
-- most one active (pending/approved) request per user per event. With the
-- new `regear_max_deaths_per_event` app setting we move the cap to an
-- application-level count check so admins can raise the limit per event
-- without a schema change. Rejected rows still stay on record for audit.

DROP INDEX IF EXISTS regear_requests_active_unique;
