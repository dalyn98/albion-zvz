-- 412: finish search_path hardening for the legacy caller assignment RPC.
--
-- The active application uses direct_assign_slot, but caller_assign_slot is
-- retained for rolling-client compatibility. Keep its SECURITY DEFINER body
-- independent from the caller-controlled search_path and preserve the
-- service-role-only boundary established by migration 250.

alter function public.caller_assign_slot(uuid, text, text)
  set search_path = public;

revoke execute on function public.caller_assign_slot(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.caller_assign_slot(uuid, text, text)
  to service_role;
