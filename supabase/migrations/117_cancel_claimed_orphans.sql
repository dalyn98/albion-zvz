-- 117: 'claimed' 상태로 매달려 있는 orphan craft_task 을 마저 정리.
--
-- 마이그 116 에서 approve_regear_request RPC 는 ('queued','claimed') 둘 다
-- cancel 하도록 고쳤지만, 백필 do-block 은 'queued' 만 정리해서 마이그 적용
-- 이전에 이미 제작자가 claim 한 task 들이 prod 큐에 남아있다.
--
-- claimed 상태에서 admin 이 silver 로 승인한 시점의 의미:
--   - 멤버는 실버 결제를 받았거나, 받아야 한다 (mode 가 아직 'crafted' 면 미지급)
--   - 제작자는 잡았지만 deliver 하지 않은 상태 (delivered/collected 면 박스가
--     이미 멤버에게 가있으니 별개 흐름)
-- → claimed 도 cancel 하는 게 맞다. 제작자에게 "취소된 작업" 으로 알리기 위해
--    cancelled_at 을 박는다 (crafter UI 에서 사라짐).

do $$
declare
  rec record;
begin
  for rec in
    select ct.id              as task_id,
           ct.guild_id         as guild_id,
           ct.regear_request_id as request_id,
           rr.fulfillment_mode  as mode,
           rr.discord_id       as discord_id,
           coalesce(rr.payout_silver, rr.claimed_silver, 0) as credit
      from public.craft_tasks ct
      join public.regear_requests rr on rr.id = ct.regear_request_id
     where ct.status = 'claimed'
       and rr.status = 'approved'
  loop
    update public.craft_tasks
       set status = 'cancelled',
           cancelled_at = now()
     where id = rec.task_id;

    -- 마이그 116 백필과 동일: 모드가 아직 'crafted' 면 멤버 미지급 상태이므로
    -- silver flip + ledger credit 을 채운다. 이미 'silver' 또는 'stocked' 면
    -- 정산은 끝났고 cancel 만.
    if rec.mode = 'crafted' then
      update public.regear_requests
         set fulfillment_mode = 'silver'
       where id = rec.request_id;
      if rec.credit > 0 and rec.discord_id is not null then
        insert into public.point_ledger (guild_id, discord_id, delta, reason, ref_id)
        values (rec.guild_id, rec.discord_id, rec.credit, 'regear_approved', rec.request_id);
      end if;
    end if;
  end loop;
end $$;
