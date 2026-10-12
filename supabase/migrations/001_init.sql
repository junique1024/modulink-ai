-- =============================================================
-- ModuLink-AI · Supabase 테이블 만들기
-- Supabase 대시보드 → SQL Editor → New query → 전체 붙여넣고 Run
-- =============================================================

-- 1) 모듈 카탈로그 테이블
create table if not exists modules (
  id          bigint generated always as identity primary key,
  category    text    not null check (category in ('base','arm','sensor')),
  name        text    not null,
  payload_kg  numeric not null default 0,   -- 베이스: 적재 가능 무게 / 로봇팔: 가반 하중
  self_kg     numeric not null default 0,   -- 모듈 자체 무게 (베이스에 실리는 무게)
  price       numeric not null,             -- 단가 (만원)
  mount       text,                         -- 장착 규격 (예: 'A', 'A,B')
  spec        text,
  level       text                          -- 센서 검사 수준: 'basic' / 'precise'
);

-- 2) 추천 결과 저장 테이블
create table if not exists recommendations (
  id              bigint generated always as identity primary key,
  created_at      timestamptz not null default now(),
  task_name       text,
  load_kg         numeric,
  distance_m      numeric,
  inspection      text,
  pick_kg         numeric,
  workers         numeric,
  labor_cost      numeric,
  combo           jsonb,
  capex           numeric,
  annual_saving   numeric,
  payback_months  numeric
);

-- 3) 예시 모듈 데이터 (시연용 값 · 나중에 실제 사양으로 교체)
insert into modules (category, name, payload_kg, self_kg, price, mount, spec, level) values
  ('base',   'ML-B100 경량 주행 베이스', 100, 0,  1800, 'A',   '최대 100kg · 1.2m/s · 라이다 자율주행', null),
  ('base',   'ML-B300 중형 주행 베이스', 300, 0,  3200, 'A,B', '최대 300kg · 1.0m/s · 라이다+3D 카메라', null),
  ('base',   'ML-B600 대형 주행 베이스', 600, 0,  5500, 'B',   '최대 600kg · 0.8m/s · 안전 스캐너 2식', null),
  ('arm',    'ML-A5 협동 로봇팔',        5,   20, 1500, 'A',   '가반 5kg · 도달 850mm', null),
  ('arm',    'ML-A15 협동 로봇팔',       15,  40, 2600, 'A',   '가반 15kg · 도달 1,300mm', null),
  ('arm',    'ML-A30 산업용 로봇팔',     30,  70, 4200, 'B',   '가반 30kg · 도달 1,700mm', null),
  ('sensor', 'ML-V1 2D 비전 검사 모듈',  0,   3,  450,  'A,B', '기본 외관 검사 · 찍힘/오염', 'basic'),
  ('sensor', 'ML-V3 3D 비전 검사 모듈',  0,   6,  1200, 'A,B', '정밀 검사 · 치수/미세 결함', 'precise');

-- 4) 접근 권한 (RLS) — 과제 시연용: 누구나 읽기/저장/삭제 가능
--    실제 서비스로 갈 때는 로그인 사용자만 허용하도록 바꿔야 합니다.
alter table modules enable row level security;
alter table recommendations enable row level security;

create policy "modules read"   on modules         for select to anon using (true);
create policy "rec read"       on recommendations for select to anon using (true);
create policy "rec insert"     on recommendations for insert to anon with check (true);
create policy "rec delete"     on recommendations for delete to anon using (true);
