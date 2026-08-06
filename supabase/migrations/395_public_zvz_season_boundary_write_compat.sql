-- Keep direct service-role writes and older integration fixtures compatible:
-- date-only writes become midnight UTC, while exact writes derive starts_on.

create or replace function public.sync_public_zvz_season_start_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.starts_at is null then
      new.starts_at := new.starts_on::timestamp at time zone 'UTC';
    else
      new.starts_on := (new.starts_at at time zone 'UTC')::date;
    end if;
  elsif new.starts_at is distinct from old.starts_at then
    new.starts_on := (new.starts_at at time zone 'UTC')::date;
  elsif new.starts_on is distinct from old.starts_on then
    new.starts_at := new.starts_on::timestamp at time zone 'UTC';
  end if;
  return new;
end;
$$;

revoke all on function public.sync_public_zvz_season_start_columns()
  from public, anon, authenticated;

drop trigger if exists trg_sync_public_zvz_season_start_columns
  on public.zvz_seasons;
create trigger trg_sync_public_zvz_season_start_columns
before insert or update of starts_on, starts_at
on public.zvz_seasons
for each row execute function public.sync_public_zvz_season_start_columns();
