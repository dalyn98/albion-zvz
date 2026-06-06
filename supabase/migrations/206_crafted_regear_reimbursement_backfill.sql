-- Existing delivered regear craft tasks already credited reimbursement in
-- deliver_craft_task before migration 205. Mark them approved so the new admin
-- approval queue only contains deliveries made after the behavior change.

update public.craft_tasks
   set reimbursement_status = case
         when coalesce(reimbursement_silver, 0) > 0 then 'approved'
         else 'not_required'
       end,
       reimbursement_approved_at = case
         when coalesce(reimbursement_silver, 0) > 0
           then coalesce(delivered_at, collected_at, expired_at)
         else reimbursement_approved_at
       end
 where task_kind = 'regear'
   and status in ('delivered', 'collected', 'expired')
   and reimbursement_status = 'not_required';
