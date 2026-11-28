begin;

create sequence public.guest_nickname_number;
alter table public.player_profiles add column transferred_to uuid references auth.users(id) on delete set null;
create table public.guest_transfers (
  guest_id uuid primary key references auth.users(id) on delete cascade,
  token_hash text not null unique,
  target_email text not null,
  expires_at timestamptz not null,
  claimed_by uuid references auth.users(id) on delete cascade
);
alter table public.guest_transfers enable row level security;
revoke all on public.guest_transfers from anon, authenticated;
revoke insert, update on public.player_profiles from authenticated;
revoke insert (user_id, nickname), update (user_id, nickname) on public.player_profiles from authenticated;
drop policy "Create registered profile" on public.player_profiles;
drop policy "Update registered profile" on public.player_profiles;

create function public.ensure_player_profile()
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  player public.player_profiles;
begin
  if auth.uid() is null then raise exception 'Necesitas una sesion.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  select * into player from public.player_profiles where user_id = auth.uid();
  if found then
    if player.transferred_to is not null then
      raise exception 'Este invitado ya fue vinculado. Entra con tu correo.';
    end if;
    return player.nickname;
  end if;
  insert into public.player_profiles(user_id, nickname)
    values (auth.uid(), 'Invitado ' || nextval('public.guest_nickname_number'))
    returning * into player;
  return player.nickname;
end;
$$;

create function public.set_player_nickname(new_nickname text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.ensure_player_profile();
  update public.player_profiles set nickname = btrim(new_nickname) where user_id = auth.uid();
end;
$$;

create or replace function public.start_game_run()
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare run_id uuid;
begin
  perform public.ensure_player_profile();
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

create or replace function public.finish_game_run(run_id uuid, run_meters integer, run_seconds double precision, run_outcome text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare run public.game_runs;
begin
  perform public.ensure_player_profile();
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
  if run_outcome = 'crash' then
    insert into public.player_scores(user_id, meters)
      values (auth.uid(), run_meters)
      on conflict (user_id) do update set meters = excluded.meters, achieved_at = now()
        where excluded.meters > public.player_scores.meters;
    return true;
  end if;
  return false;
end;
$$;

create function public.prepare_guest_transfer(email_address text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare token uuid := gen_random_uuid();
begin
  if (auth.jwt()->>'is_anonymous') is distinct from 'true' then
    raise exception 'Solo un invitado puede preparar la vinculacion.';
  end if;
  if email_address is null or length(email_address) > 254
     or btrim(email_address) !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Correo no valido.';
  end if;
  perform public.ensure_player_profile();
  insert into public.guest_transfers(guest_id, token_hash, target_email, expires_at)
    values (auth.uid(), md5(token::text), lower(btrim(email_address)), now() + interval '1 hour')
    on conflict (guest_id) do update set token_hash = excluded.token_hash,
      target_email = excluded.target_email, expires_at = excluded.expires_at, claimed_by = null;
  return token;
end;
$$;

create function public.claim_guest_results(transfer_token uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  transfer public.guest_transfers;
  verified_email text;
  guest_name text;
begin
  if auth.uid() is null or (auth.jwt()->>'is_anonymous') is distinct from 'false' then
    raise exception 'Confirma tu correo antes de sincronizar.';
  end if;
  select lower(email) into verified_email from auth.users
    where id = auth.uid() and email_confirmed_at is not null;
  select * into transfer from public.guest_transfers
    where token_hash = md5(transfer_token::text);
  if not found then raise exception 'No se pudo verificar la vinculacion de este invitado.'; end if;
  -- Match the ordering used by guest writes before locking the transfer row.
  perform pg_advisory_xact_lock(hashtextextended(least(transfer.guest_id::text, auth.uid()::text), 0));
  perform pg_advisory_xact_lock(hashtextextended(greatest(transfer.guest_id::text, auth.uid()::text), 0));
  select * into transfer from public.guest_transfers
    where token_hash = md5(transfer_token::text) for update;
  if not found or transfer.target_email is distinct from verified_email then
    raise exception 'No se pudo verificar la vinculacion de este invitado.';
  end if;
  if transfer.claimed_by = auth.uid() then return; end if;
  if transfer.claimed_by is not null or transfer.expires_at < now() then
    raise exception 'La vinculacion ya fue usada o vencio. Solicita otro enlace desde el invitado.';
  end if;
  select nickname into guest_name from public.player_profiles
    where user_id = transfer.guest_id and transferred_to is null;
  if not found then raise exception 'El invitado ya fue vinculado.'; end if;
  insert into public.player_profiles(user_id, nickname)
    values (auth.uid(), guest_name) on conflict (user_id) do nothing;
  insert into public.player_scores(user_id, meters, achieved_at)
    select auth.uid(), meters, achieved_at from public.player_scores where user_id = transfer.guest_id
    on conflict (user_id) do update set meters = excluded.meters, achieved_at = excluded.achieved_at
      where excluded.meters > public.player_scores.meters;
  update public.game_runs set user_id = auth.uid() where user_id = transfer.guest_id;
  delete from public.player_scores where user_id = transfer.guest_id;
  update public.player_profiles set transferred_to = auth.uid() where user_id = transfer.guest_id;
  update public.guest_transfers set claimed_by = auth.uid() where guest_id = transfer.guest_id;
end;
$$;

-- Preserve completed guest results from the previous version.
insert into public.player_profiles(user_id, nickname)
  select distinct user_id, 'Invitado ' || nextval('public.guest_nickname_number')
    from (select distinct user_id from public.game_runs) users
  on conflict (user_id) do nothing;
insert into public.player_scores(user_id, meters)
  select user_id, max(meters) from public.game_runs
    where ended_at is not null and outcome = 'crash' group by user_id
  on conflict (user_id) do update set meters = excluded.meters
    where excluded.meters > public.player_scores.meters;

revoke all on function public.ensure_player_profile(), public.set_player_nickname(text),
  public.prepare_guest_transfer(text), public.claim_guest_results(uuid) from public;
grant execute on function public.ensure_player_profile(), public.set_player_nickname(text),
  public.prepare_guest_transfer(text), public.claim_guest_results(uuid) to authenticated;

commit;
