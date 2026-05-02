-- 141_craft_orders_optional_box.sql
-- ============================================================
-- 길드 발주 수주 → 납품 흐름에서 박스 번호를 옵션으로 변경.
-- ============================================================
-- - 길드 사정에 따라 "박스 시스템 없이 자유 메모로만 어디 뒀는지 적기" 만 쓰는
--   경우가 있어 (메모: "Lymhurst, 7번 보관함" 등) box_number 입력을 강제하지
--   않는다.
-- - craft_tasks.box_number 컬럼은 마이그 106 부터 이미 nullable 이고 partial
--   unique 인덱스도 `where box_number is not null` 라 schema 변경은 없음.
-- - deliver_craft_order_task RPC 만 p_box_number = null 케이스에서 범위 검증을
--   건너뛰도록 갱신.

set local statement_timeout = '30s';
set local lock_timeout = '5s';

create or replace function public.deliver_craft_order_task(
  p_task_id uuid,
  p_guild_id uuid,
  p_crafter_discord_id text,
  p_box_number integer,
  p_craft_city text,
  p_craft_focus_used boolean,
  p_expiry_days integer
) returns void language plpgsql security definer as $$
declare
  v_box_min integer;
  v_box_max integer;
begin
  if p_box_number is not null then
    select coalesce((select value::integer from public.app_settings
                      where key = 'craft_box_range_min' and guild_id = p_guild_id), 1),
           coalesce((select value::integer from public.app_settings
                      where key = 'craft_box_range_max' and guild_id = p_guild_id), 30)
      into v_box_min, v_box_max;
    if p_box_number < v_box_min or p_box_number > v_box_max then
      raise exception 'BOX_OUT_OF_RANGE';
    end if;
  end if;
  if p_expiry_days < 1 or p_expiry_days > 30 then
    raise exception 'EXPIRY_OUT_OF_RANGE';
  end if;

  update craft_tasks
     set status = 'delivered',
         box_number = p_box_number,
         craft_city = p_craft_city,
         craft_focus_used = p_craft_focus_used,
         delivered_at = now(),
         expires_at = now() + make_interval(days => p_expiry_days)
   where id = p_task_id
     and guild_id = p_guild_id
     and crafter_discord_id = p_crafter_discord_id
     and task_kind = 'guild_order'
     and status = 'claimed';

  if not found then
    raise exception 'CRAFT_TASK_DELIVER_FAILED';
  end if;
end;
$$;
