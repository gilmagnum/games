-- =============================================================
--  Mini-Games Hub — Global Leaderboards
--  Supabase / Postgres schema
--  Run once in the SQL editor of a NEW, dedicated Supabase project.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Games registry
--    Every game that may submit scores must exist here.
--    max_score guards against absurd/forged submissions.
-- -------------------------------------------------------------
create table if not exists public.games (
  slug         text primary key,
  title        text        not null,
  subtitle     text,
  emoji        text        default '🎮',
  url          text        not null,
  score_label  text        not null default 'נקודות',
  score_order  text        not null default 'desc'
                 check (score_order in ('desc','asc')),
  max_score    bigint      not null default 100000000,
  active       boolean     not null default true,
  sort_order   int         not null default 100,
  created_at   timestamptz not null default now()
);

comment on column public.games.score_order is
  'desc = higher is better (points). asc = lower is better (time in ms, moves).';

-- -------------------------------------------------------------
-- 2. Scores
-- -------------------------------------------------------------
create table if not exists public.scores (
  id          bigint generated always as identity primary key,
  game_slug   text        not null references public.games(slug) on delete cascade,
  player      text        not null,
  score       bigint      not null,
  meta        jsonb       not null default '{}'::jsonb,
  client_id   uuid,
  created_at  timestamptz not null default now(),
  constraint scores_player_len   check (char_length(btrim(player)) between 1 and 16),
  constraint scores_score_sane   check (score >= 0 and score <= 1000000000),
  constraint scores_meta_size    check (pg_column_size(meta) < 2048)
);

create index if not exists scores_game_desc_idx
  on public.scores (game_slug, score desc, created_at asc);
create index if not exists scores_game_asc_idx
  on public.scores (game_slug, score asc, created_at asc);
create index if not exists scores_client_recent_idx
  on public.scores (client_id, created_at desc);

-- -------------------------------------------------------------
-- 3. Row Level Security
--    Anyone may READ. Nobody may write directly — writes only
--    go through submit_score(), which validates and rate-limits.
-- -------------------------------------------------------------
alter table public.games  enable row level security;
alter table public.scores enable row level security;

drop policy if exists games_public_read on public.games;
create policy games_public_read on public.games
  for select to anon, authenticated using (active);

drop policy if exists scores_public_read on public.scores;
create policy scores_public_read on public.scores
  for select to anon, authenticated using (true);

-- no insert / update / delete policies on purpose.

-- Explicit grants (Supabase normally sets these by default — stated here so
-- the script is self-sufficient and the intent is unambiguous).
grant usage on schema public to anon, authenticated;
grant select on public.games, public.scores to anon, authenticated;
revoke insert, update, delete on public.games, public.scores from anon, authenticated;

-- -------------------------------------------------------------
-- 4. Helpers
-- -------------------------------------------------------------

-- Strip control chars, collapse whitespace, clamp to 16 chars.
create or replace function public.clean_player_name(raw text)
returns text
language sql
immutable
as $fn$
  select nullif(
    left(
      btrim(
        regexp_replace(
          regexp_replace(coalesce(raw, ''), '[[:cntrl:]]', ' ', 'g'),
          '[[:space:]]+', ' ', 'g'
        )
      ),
      16
    ),
    ''
  );
$fn$;

-- -------------------------------------------------------------
-- 5. submit_score() — the only write path
--    Returns the newly created row plus its rank.
-- -------------------------------------------------------------
create or replace function public.submit_score(
  p_game      text,
  p_player    text,
  p_score     bigint,
  p_meta      jsonb default '{}'::jsonb,
  p_client_id uuid  default null
)
returns table (
  id         bigint,
  player     text,
  score      bigint,
  rank       bigint,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game   public.games%rowtype;
  v_name   text;
  v_recent int;
  v_id     bigint;
begin
  select * into v_game from public.games where slug = p_game and active;
  if not found then
    raise exception 'unknown_game: %', p_game using errcode = 'P0001';
  end if;

  v_name := public.clean_player_name(p_player);
  if v_name is null then
    raise exception 'invalid_player_name' using errcode = 'P0001';
  end if;

  if p_score is null or p_score < 0 or p_score > v_game.max_score then
    raise exception 'score_out_of_range' using errcode = 'P0001';
  end if;

  -- Rate limit: max 15 submissions per client per 10 minutes.
  if p_client_id is not null then
    select count(*) into v_recent
      from public.scores sc
     where sc.client_id = p_client_id
       and sc.created_at > now() - interval '10 minutes';
    if v_recent >= 15 then
      raise exception 'rate_limited' using errcode = 'P0001';
    end if;
  end if;

  insert into public.scores as sc (game_slug, player, score, meta, client_id)
  values (p_game, v_name, p_score, coalesce(p_meta, '{}'::jsonb), p_client_id)
  returning sc.id into v_id;

  return query
  select s.id, s.player, s.score, r.rnk, s.created_at
    from public.scores s
    join lateral (
      select count(*) + 1 as rnk
        from public.scores b
       where b.game_slug = s.game_slug
         and case when v_game.score_order = 'asc'
                  then b.score < s.score
                  else b.score > s.score
             end
    ) r on true
   where s.id = v_id;
end;
$$;

revoke all on function public.submit_score(text, text, bigint, jsonb, uuid) from public;
grant execute on function public.submit_score(text, text, bigint, jsonb, uuid) to anon, authenticated;

-- -------------------------------------------------------------
-- 6. top_scores() — the leading runs, ordered per game rules
--    Arcade style: a player can hold several places on the board.
-- -------------------------------------------------------------
create or replace function public.top_scores(
  p_game  text,
  p_limit int default 10
)
returns table (
  rank       bigint,
  player     text,
  score      bigint,
  meta       jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_order text;
begin
  select score_order into v_order from public.games where slug = p_game;
  if v_order is null then
    return;
  end if;

  return query
  select row_number() over (
           order by case when v_order = 'asc' then s.score end asc nulls last,
                    case when v_order = 'desc' then s.score end desc nulls last,
                    s.created_at asc
         ) as rnk,
         s.player, s.score, s.meta, s.created_at
    from public.scores s
   where s.game_slug = p_game
   order by rnk
   limit greatest(1, least(coalesce(p_limit, 10), 100));
end;
$$;

grant execute on function public.top_scores(text, int) to anon, authenticated;

-- -------------------------------------------------------------
-- 7. hub_leaderboards() — one call, champion of every game
--    Used by the hub home page.
-- -------------------------------------------------------------
create or replace function public.hub_leaderboards(p_per_game int default 3)
returns table (
  game_slug text,
  rank      bigint,
  player    text,
  score     bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  g record;
begin
  for g in select slug from public.games where active order by sort_order, slug loop
    return query
      select g.slug, t.rank, t.player, t.score
        from public.top_scores(g.slug, p_per_game) as t;
  end loop;
end;
$$;

grant execute on function public.hub_leaderboards(int) to anon, authenticated;

-- -------------------------------------------------------------
-- 8. Realtime (optional) — lets open pages update live
-- -------------------------------------------------------------
-- alter publication supabase_realtime add table public.scores;
