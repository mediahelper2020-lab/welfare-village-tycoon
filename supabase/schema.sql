-- =========================================================
-- 복지마을 타이쿤 — 랭킹 테이블
--
-- Supabase 대시보드 → SQL Editor 에 통째로 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다 (if not exists / drop policy if exists).
--
-- 게임은 브라우저에 공개되는 anon 키로 이 테이블에 접근합니다.
-- 따라서 실제 보호는 아래 RLS 정책이 담당합니다.
--   · 읽기   : 누구나 가능 (순위표를 보여줘야 하므로)
--   · 등록   : 누구나 가능 (로그인 없이 점수를 올리는 게임이므로)
--   · 수정   : 아무도 불가  ← update 정책을 만들지 않음
--   · 삭제   : 아무도 불가  ← delete 정책을 만들지 않음
-- RLS가 켜진 테이블은 정책이 없는 동작을 전부 거부합니다.
-- 즉 남의 기록을 고치거나 지우는 것은 anon 키로 불가능합니다.
-- =========================================================

create table if not exists public.leaderboard (
  id            uuid        primary key default gen_random_uuid(),
  nickname      text        not null,
  village       text        not null,
  score         integer     not null,
  pop           integer     not null,
  sat           numeric(4,1) not null,
  closed_cases  integer     not null,
  months        integer     not null,
  created_at    timestamptz not null default now(),

  -- 말도 안 되는 값이 들어오지 않도록 최소한의 방어선
  constraint leaderboard_nickname_len check (char_length(nickname) between 1 and 12),
  constraint leaderboard_village_len  check (char_length(village)  between 1 and 12),
  constraint leaderboard_score_range  check (score        between 0 and 1000000),
  constraint leaderboard_pop_range    check (pop          between 0 and 1000000),
  constraint leaderboard_sat_range    check (sat          between 0 and 100),
  constraint leaderboard_cases_range  check (closed_cases between 0 and 100000),
  constraint leaderboard_months_range check (months       between 0 and 100000)
);

-- 소속기관 칸 (이름 = 기존 nickname 칸을 그대로 씀).
-- 이미 만들어진 테이블에도 안전하게 더할 수 있도록 add column if not exists로 씀.
alter table public.leaderboard add column if not exists org text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'leaderboard_org_len') then
    alter table public.leaderboard
      add constraint leaderboard_org_len check (org is null or char_length(org) <= 20);
  end if;
end $$;

-- 순위표 조회(점수 내림차순)를 위한 인덱스
create index if not exists leaderboard_score_idx
  on public.leaderboard (score desc, created_at asc);

-- ---------------------------------------------------------
-- RLS
-- ---------------------------------------------------------
alter table public.leaderboard enable row level security;

drop policy if exists "누구나 순위표를 볼 수 있다" on public.leaderboard;
create policy "누구나 순위표를 볼 수 있다"
  on public.leaderboard for select
  to anon, authenticated
  using (true);

drop policy if exists "누구나 자기 기록을 올릴 수 있다" on public.leaderboard;
create policy "누구나 자기 기록을 올릴 수 있다"
  on public.leaderboard for insert
  to anon, authenticated
  with check (true);

-- update / delete 정책은 일부러 만들지 않습니다.
-- 기록을 지워야 할 일이 생기면 대시보드(Table Editor)나
-- service_role 키로만 하세요. service_role 키는 절대 게임 코드에 넣지 마세요.
