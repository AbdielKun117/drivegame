begin;

create table public.player_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (nickname = btrim(nickname) and nickname ~ '^[A-Za-z0-9_ -]{3,20}$'),
  created_at timestamptz not null default now()
);

create table public.game_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  guest boolean not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  meters integer,
  seconds double precision,
  outcome text check (outcome in ('crash', 'menu')),
  check (meters is null or meters >= 0),
  check (seconds is null or (seconds >= 0 and seconds < 'Infinity'::double precision))
);
create index game_runs_user_started on public.game_runs (user_id, started_at desc);

create table public.player_scores (
  user_id uuid primary key references public.player_profiles(user_id) on delete cascade,
  meters integer not null check (meters >= 0),
  achieved_at timestamptz not null default now()
);
create index player_scores_ranking on public.player_scores (meters desc, achieved_at);

alter table public.player_profiles enable row level security;
alter table public.game_runs enable row level security;
alter table public.player_scores enable row level security;
revoke all on public.player_profiles, public.game_runs, public.player_scores from anon, authenticated;
grant select on public.player_profiles to authenticated;
grant insert (user_id, nickname), update (user_id, nickname) on public.player_profiles to authenticated;
create policy "Read own profile" on public.player_profiles for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Create registered profile" on public.player_profiles for insert to authenticated
  with check (user_id = (select auth.uid()) and (select auth.jwt()->>'is_anonymous') = 'false');
create policy "Update registered profile" on public.player_profiles for update to authenticated
  using (user_id = (select auth.uid()) and (select auth.jwt()->>'is_anonymous') = 'false')
  with check (user_id = (select auth.uid()) and (select auth.jwt()->>'is_anonymous') = 'false');

create function public.start_game_run()
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  run_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Necesitas una sesion para registrar partidas.';
  end if;
  -- Serialize requests per player so concurrent starts cannot bypass the limit.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  if (select count(*) from public.game_runs
      where user_id = auth.uid() and started_at > now() - interval '1 minute') >= 20 then
    raise exception 'Demasiadas partidas seguidas. Espera un minuto.';
  end if;
  insert into public.game_runs(user_id, guest)
    values (auth.uid(), coalesce((auth.jwt()->>'is_anonymous')::boolean, true))
    returning id into run_id;
  return run_id;
end;
$$;

create function public.finish_game_run(run_id uuid, run_meters integer, run_seconds double precision, run_outcome text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  run public.game_runs;
  published boolean := false;
begin
  select * into run from public.game_runs
    where id = run_id and user_id = auth.uid() for update;
  if not found then raise exception 'Partida no encontrada.'; end if;
  if run.ended_at is not null then raise exception 'La partida ya fue registrada.'; end if;
  if run_meters is null or run_seconds is null or run_outcome is null
     or run_meters < 0 or run_seconds < 0
     or run_seconds >= 'Infinity'::double precision
     or run_meters > run_seconds * 63 + 5
     or run_seconds > extract(epoch from (now() - run.started_at)) + 30
     or run_outcome not in ('crash', 'menu') then
    raise exception 'Resultado de partida no valido.';
  end if;
  update public.game_runs set ended_at = now(), meters = run_meters,
    seconds = run_seconds, outcome = run_outcome where id = run_id;
  if not run.guest and (auth.jwt()->>'is_anonymous') = 'false' and run_outcome = 'crash'
     and exists (select 1 from public.player_profiles where user_id = auth.uid()) then
    insert into public.player_scores(user_id, meters)
      values (auth.uid(), run_meters)
      on conflict (user_id) do update set meters = excluded.meters, achieved_at = now()
        where excluded.meters > public.player_scores.meters;
    published := true;
  end if;
  return published;
end;
$$;

create function public.get_leaderboard()
returns table(nickname text, meters integer)
language sql stable security definer set search_path = ''
as $$
  select p.nickname, s.meters from public.player_scores s
    join public.player_profiles p on p.user_id = s.user_id
    order by s.meters desc, s.achieved_at, s.user_id limit 20;
$$;

revoke all on function public.start_game_run() from public;
revoke all on function public.finish_game_run(uuid, integer, double precision, text) from public;
revoke all on function public.get_leaderboard() from public;
grant execute on function public.start_game_run() to authenticated;
grant execute on function public.finish_game_run(uuid, integer, double precision, text) to authenticated;
grant execute on function public.get_leaderboard() to anon, authenticated;

commit;
