-- Migration 361 was already applied before its new RPCs were exercised through
-- PostgREST. Force the linked project's API schema cache to expose them now.
-- Fresh databases also receive the same notification at the end of 361.

notify pgrst, 'reload schema';
