-- 299: Classify existing regear rows without rewriting their policy snapshots.

update public.regear_requests
set regear_origin_type = case
  when auto_generated then 'auto'
  when event_id is not null then 'event'
  else 'free_window'
end
where regear_origin_type is null;
