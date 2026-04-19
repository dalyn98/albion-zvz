-- 한 슬롯(빌드 1개)을 재사용하기 위한 개별 템플릿 저장소. event_templates는
-- 파티 전체를 담는 반면, 이 테이블은 슬롯 1개 분량의 설정(역할/메모/8장비/복수무기/스킬)만
-- JSONB로 들고 있는다. 두 개념의 쿼리/적용 경로가 완전히 달라 스키마를 분리.

create table if not exists public.slot_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists slot_templates_created_at_idx
  on public.slot_templates (created_at desc);
