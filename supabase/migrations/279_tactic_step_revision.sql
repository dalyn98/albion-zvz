-- 279: Treat tactic step membership as part of the board revision.
--
-- Event snapshots compare the captured board revision with the current board
-- revision. Step edits already touch the board through the atomic document save;
-- inserts and deletes need the same invariant inside their database transaction.

create or replace function public.touch_tactic_board_step_revision()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_board_id uuid;
  v_guild_id uuid;
begin
  if tg_op = 'DELETE' then
    v_board_id := old.board_id;
    v_guild_id := old.guild_id;
  else
    v_board_id := new.board_id;
    v_guild_id := new.guild_id;
  end if;

  update public.tactic_boards
  set updated_at = greatest(
    clock_timestamp(),
    updated_at + interval '1 millisecond'
  )
  where id = v_board_id
    and guild_id = v_guild_id;

  return null;
end;
$$;

drop trigger if exists tactic_steps_touch_board_revision_insert
  on public.tactic_steps;
create trigger tactic_steps_touch_board_revision_insert
after insert on public.tactic_steps
for each row execute function public.touch_tactic_board_step_revision();

drop trigger if exists tactic_steps_touch_board_revision_delete
  on public.tactic_steps;
create trigger tactic_steps_touch_board_revision_delete
after delete on public.tactic_steps
for each row execute function public.touch_tactic_board_step_revision();

comment on function public.touch_tactic_board_step_revision() is
  'Monotonically bumps a tactic board revision when a step is added or removed.';
