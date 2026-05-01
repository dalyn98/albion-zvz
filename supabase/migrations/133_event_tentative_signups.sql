-- 133: 이벤트 참가예정 (tentative signups).
--
-- 배경: 알비온은 한 사람이 여러 역할(탱/힐/딜) 을 할 수 있어 조합에 맞춰 슬롯
-- 배정을 기다리는 멤버가 많다. 단일 슬롯 신청은 너무 빨라 단일 역할만 가능한
-- 멤버를 차단하고, 미신청은 인원수 파악이 어렵다. 그래서 별도의 "참가예정"
-- 자료구조를 둬 가능한 역할군 (복수) + 이름 만 가볍게 모은다.
--
-- 자동 정리: 같은 이벤트의 슬롯에 assigned_discord_id 또는 requested_discord_id
-- 가 채워지면 해당 멤버의 tentative 행을 트리거로 삭제한다 (정식 신청으로
-- 격상되면 tentative 는 자연스레 사라진다).
--
-- 다테넌트: (guild_id, event_id, discord_id) 복합 unique. 같은 이벤트의 같은
-- 멤버는 한 행만 갖는다 (역할 변경은 update). guild_id 는 events.guild_id 와
-- 동일.

create table if not exists public.event_tentative_signups (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  discord_id text not null,
  username text not null,
  -- SLOT_ROLES enum (Caller/OffTanker/DefTanker/Sup/Healer/Dps/BM/기타) 를
  -- 어플리케이션에서 검증. 역할군 빈 배열은 허용하지 않는다 (의미 없는 행 방지).
  possible_roles text[] not null check (cardinality(possible_roles) > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists event_tentative_signups_unique
  on public.event_tentative_signups (guild_id, event_id, discord_id);

create index if not exists event_tentative_signups_event_idx
  on public.event_tentative_signups (event_id);

-- updated_at 자동 갱신 트리거.
create or replace function public.set_event_tentative_signups_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_event_tentative_signups_updated_at on public.event_tentative_signups;
create trigger set_event_tentative_signups_updated_at
  before update on public.event_tentative_signups
  for each row execute function public.set_event_tentative_signups_updated_at();

-- 슬롯이 멤버에게 할당/요청되면 같은 이벤트의 tentative 행을 정리.
-- slots 테이블은 event_id 가 직접 없고 party_id 만 있어 parties 를 lookup.
create or replace function public.cleanup_tentative_on_slot_fill()
returns trigger
language plpgsql
security definer
as $$
declare
  v_event_id uuid;
begin
  -- assigned_discord_id 가 새로 채워졌거나 다른 사람으로 바뀐 경우
  if new.assigned_discord_id is not null
     and (tg_op = 'INSERT' or new.assigned_discord_id is distinct from old.assigned_discord_id) then
    select event_id into v_event_id from public.parties where id = new.party_id;
    if v_event_id is not null then
      delete from public.event_tentative_signups
       where event_id = v_event_id
         and discord_id = new.assigned_discord_id;
    end if;
  end if;

  -- requested_discord_id (bomb squad 신청 대기) 도 같은 처리.
  if new.requested_discord_id is not null
     and (tg_op = 'INSERT' or new.requested_discord_id is distinct from old.requested_discord_id) then
    select event_id into v_event_id from public.parties where id = new.party_id;
    if v_event_id is not null then
      delete from public.event_tentative_signups
       where event_id = v_event_id
         and discord_id = new.requested_discord_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists slot_fill_cleanup_tentative on public.slots;
create trigger slot_fill_cleanup_tentative
  after insert or update of assigned_discord_id, requested_discord_id on public.slots
  for each row execute function public.cleanup_tentative_on_slot_fill();

-- RLS: 087 baseline 패턴 — service_role 만 우회, anon/authenticated 는
-- deny-by-default. 모든 server action 이 service_role 로 접근하므로 앱 기능은
-- 영향 없음.
alter table public.event_tentative_signups enable row level security;
