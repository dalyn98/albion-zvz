-- 154: 사이펀 (Siphoned Energy) 입출금 원장.
--
-- 알비온 오버차지 시스템은 "Siphoned Energy" 아이템을 소비한다. 대형 길드는
-- 개인이 길드 금고에 사이펀을 입금하고, 필요할 때 출금해서 쓰는 방식으로
-- 운영한다. 개인별 누적 입출금 (= 순 사용량) 추적이 운영 필수.
--
-- 입력은 인게임 길드 로그를 텍스트로 복사·붙여넣기. 포맷이 #047 의 상점
-- chest log 와 동일 (TSV/RTF 6 필드: 날짜 · 플레이어 · 아이템 · 인챈트 ·
-- 품질 · 수량). 같은 파서 (parseChestLog) 재사용하되 siphon 아이템만 필터해
-- 본 테이블에 저장.
--
-- 양수 quantity = 입금 (deposit), 음수 = 출금 (withdraw).
--
-- 한 줄 unique 키는 (logged_at, player, item, enchant, quality, quantity) —
-- 같은 사람이 같은 초에 같은 수량을 두 번 넣는 일은 사실상 없음. 같은 batch
-- 를 두 번 붙여넣어도 중복 무시.

create table if not exists public.siphon_ledger (
  id uuid primary key default gen_random_uuid(),
  -- 멀티테넌트 격리. 같은 인게임 시간/플레이어라도 다른 길드의 사이펀은 별도.
  guild_id uuid not null references public.tenants(id) on delete cascade,
  -- 인게임 시간 (KST 기준). parseChestLog 가 +09:00 으로 파싱.
  logged_at timestamptz not null,
  -- 알비온 인게임 플레이어 이름 (Discord nick 아님). 누구의 입출금인지의 1차 키.
  -- 추후 resolveAlbionDisplayName 으로 Discord 매핑.
  player text not null,
  -- 원본 아이템명 (서버 locale 그대로). siphon 화이트리스트 통과한 행만 저장.
  item_name_raw text not null,
  -- 인챈트(0~4) / 품질(1~5) — siphon 도 인챈트 0 만 존재하지만 포맷 일관성을 위해 저장.
  enchant integer not null default 0,
  quality integer not null default 1,
  -- 양수 = 입금, 음수 = 출금. 0 은 인게임 로그에 안 나타남 (필요 시 거부).
  quantity integer not null,
  -- 감사 추적. 누가 언제 import 했는지.
  imported_at timestamptz not null default now(),
  imported_by text,
  constraint siphon_ledger_quantity_nonzero check (quantity <> 0)
);

-- dedupe — 같은 길드/시간/플레이어/아이템/스펙/수량은 단 한 행만.
create unique index if not exists siphon_ledger_dedupe_idx
  on public.siphon_ledger (
    guild_id, logged_at, player, item_name_raw, enchant, quality, quantity
  );

-- 시간 역순 조회 (최근 로그 우선).
create index if not exists siphon_ledger_guild_logged_at_idx
  on public.siphon_ledger (guild_id, logged_at desc);

-- per-player 집계 조회 (sum/group by player).
create index if not exists siphon_ledger_guild_player_idx
  on public.siphon_ledger (guild_id, player);

comment on table public.siphon_ledger is
  '사이펀 (Siphoned Energy) 입출금 원장. 양수=입금, 음수=출금. 인게임 길드 로그 paste 로 적재.';

-- service_role 만 접근. anon/authenticated 직접 읽기 차단.
alter table public.siphon_ledger enable row level security;
