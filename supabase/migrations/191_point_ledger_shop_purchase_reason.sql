-- 191: Restore shop_purchase in point_ledger reason CHECK.
--
-- Later reason-expansion migrations rewrote point_ledger_reason_check but did
-- not carry forward the guild-shop reason added in migration 047. As a result,
-- approve_shop_order can fail when it inserts a shop_purchase debit.

alter table public.point_ledger
  drop constraint if exists point_ledger_reason_check;

alter table public.point_ledger
  add constraint point_ledger_reason_check
  check (reason in (
    'regear_approved',
    'exchange_paid',
    'admin_adjust',
    'transfer_in',
    'transfer_out',
    'donation_approved',
    'event_payout_approved',
    'craft_reimbursement',
    'craft_order_payout',
    'shop_purchase'
  ));
