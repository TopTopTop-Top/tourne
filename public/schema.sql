-- Tourne : schéma multijoueurs
-- À coller dans Supabase → SQL Editor → New query → Run

create extension if not exists "pgcrypto";

-- Profils liés aux comptes Auth
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tier int not null default 1 check (tier between 1 and 20),
  owner_id uuid not null references public.profiles (id) on delete restrict,
  invite_code text not null unique,
  merged_into uuid references public.leagues (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.league_members (
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')) default 'member',
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

-- Fiche joueur dans une ligue (peut être liée à un compte plus tard)
create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  name text not null,
  user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (league_id, name)
);

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  name text not null,
  started_at timestamptz not null default now(),
  closed_at timestamptz,
  standing jsonb
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  season_id uuid references public.seasons (id) on delete set null,
  date timestamptz not null default now(),
  present_player_ids uuid[] not null default '{}',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- status:
--   planned   = journée prévue
--   proposed  = score saisi, en attente de validation des 4
--   confirmed = validé → compte pour le niveau
--   rejected  = refusé
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  season_id uuid references public.seasons (id) on delete set null,
  session_id uuid references public.sessions (id) on delete set null,
  team_a uuid[] not null,
  team_b uuid[] not null,
  sets jsonb not null default '[]'::jsonb,
  status text not null check (status in ('planned', 'proposed', 'confirmed', 'rejected')) default 'planned',
  proposed_by uuid references public.profiles (id) on delete set null,
  played_at timestamptz,
  created_at timestamptz not null default now(),
  check (cardinality(team_a) = 2),
  check (cardinality(team_b) = 2)
);

create table if not exists public.match_validations (
  match_id uuid not null references public.matches (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  vote text not null check (vote in ('approve', 'reject')),
  created_at timestamptz not null default now(),
  primary key (match_id, user_id)
);

create index if not exists leagues_invite_code_idx on public.leagues (invite_code);
create index if not exists players_league_idx on public.players (league_id);
create index if not exists matches_league_idx on public.matches (league_id);
create index if not exists seasons_league_idx on public.seasons (league_id);

-- Profil auto à l'inscription
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1), 'Joueur')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Code d'invitation
create or replace function public.generate_invite_code()
returns text
language sql
as $$
  select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
$$;

-- Créer une ligue + owner + saison 1
create or replace function public.create_league(p_name text, p_tier int default 1)
returns public.leagues
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_league public.leagues;
begin
  if v_user is null then
    raise exception 'Non connecté';
  end if;

  insert into public.leagues (name, tier, owner_id, invite_code)
  values (trim(p_name), greatest(1, least(20, coalesce(p_tier, 1))), v_user, public.generate_invite_code())
  returning * into v_league;

  insert into public.league_members (league_id, user_id, role)
  values (v_league.id, v_user, 'owner');

  insert into public.seasons (league_id, name)
  values (v_league.id, 'Saison 1');

  return v_league;
end;
$$;

-- Rejoindre une ligue par code
create or replace function public.join_league(p_code text)
returns public.leagues
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_league public.leagues;
begin
  if v_user is null then
    raise exception 'Non connecté';
  end if;

  select * into v_league
  from public.leagues
  where invite_code = upper(trim(p_code))
    and merged_into is null;

  if v_league.id is null then
    raise exception 'Code invalide';
  end if;

  insert into public.league_members (league_id, user_id, role)
  values (v_league.id, v_user, 'member')
  on conflict do nothing;

  return v_league;
end;
$$;

-- Un match devient confirmed si assez d'approbations parmi les comptes liés aux 4 joueurs
create or replace function public.refresh_match_status(p_match_id uuid)
returns public.matches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches;
  v_needed int;
  v_approves int;
  v_rejects int;
begin
  select * into v_match from public.matches where id = p_match_id;
  if v_match.id is null then
    raise exception 'Match introuvable';
  end if;

  select count(*)::int into v_needed
  from public.players p
  where p.id = any (v_match.team_a || v_match.team_b)
    and p.user_id is not null;

  select
    count(*) filter (where vote = 'approve'),
    count(*) filter (where vote = 'reject')
  into v_approves, v_rejects
  from public.match_validations
  where match_id = p_match_id;

  if v_rejects > 0 then
    update public.matches set status = 'rejected' where id = p_match_id returning * into v_match;
  elsif v_needed = 0 and v_match.status = 'proposed' then
    -- Aucun des 4 n'a de compte lié : l'admin/proposer confirme seul
    update public.matches set status = 'confirmed' where id = p_match_id returning * into v_match;
  elsif v_needed > 0 and v_approves >= greatest(1, ceil(v_needed * 0.75)::int) then
    update public.matches set status = 'confirmed' where id = p_match_id returning * into v_match;
  else
    update public.matches set status = 'proposed' where id = p_match_id returning * into v_match;
  end if;

  return v_match;
end;
$$;

create or replace function public.vote_match(p_match_id uuid, p_vote text)
returns public.matches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_match public.matches;
  v_ok boolean;
begin
  if v_user is null then
    raise exception 'Non connecté';
  end if;
  if p_vote not in ('approve', 'reject') then
    raise exception 'Vote invalide';
  end if;

  select * into v_match from public.matches where id = p_match_id;
  if v_match.status not in ('proposed', 'rejected') then
    raise exception 'Ce match n''attend pas de validation';
  end if;

  select exists (
    select 1
    from public.players p
    where p.user_id = v_user
      and p.id = any (v_match.team_a || v_match.team_b)
  ) into v_ok;

  if not v_ok then
    raise exception 'Seuls les 4 joueurs du match peuvent valider';
  end if;

  insert into public.match_validations (match_id, user_id, vote)
  values (p_match_id, v_user, p_vote)
  on conflict (match_id, user_id) do update set vote = excluded.vote, created_at = now();

  return public.refresh_match_status(p_match_id);
end;
$$;

-- RLS
alter table public.profiles enable row level security;
alter table public.leagues enable row level security;
alter table public.league_members enable row level security;
alter table public.players enable row level security;
alter table public.seasons enable row level security;
alter table public.sessions enable row level security;
alter table public.matches enable row level security;
alter table public.match_validations enable row level security;

create or replace function public.is_league_member(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.league_members
    where league_id = p_league_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_league_admin(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.league_members
    where league_id = p_league_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated using (true);
drop policy if exists "profiles update self" on public.profiles;
create policy "profiles update self" on public.profiles for update to authenticated using (id = auth.uid());

drop policy if exists "leagues read members" on public.leagues;
create policy "leagues read members" on public.leagues for select to authenticated
  using (public.is_league_member(id) or owner_id = auth.uid());
drop policy if exists "leagues update admin" on public.leagues;
create policy "leagues update admin" on public.leagues for update to authenticated
  using (public.is_league_admin(id));

drop policy if exists "members read" on public.league_members;
create policy "members read" on public.league_members for select to authenticated
  using (public.is_league_member(league_id));
drop policy if exists "members admin write" on public.league_members;
create policy "members admin write" on public.league_members for all to authenticated
  using (public.is_league_admin(league_id))
  with check (public.is_league_admin(league_id));

drop policy if exists "players read" on public.players;
create policy "players read" on public.players for select to authenticated
  using (public.is_league_member(league_id));
drop policy if exists "players write members" on public.players;
create policy "players write members" on public.players for all to authenticated
  using (public.is_league_member(league_id))
  with check (public.is_league_member(league_id));

drop policy if exists "seasons read" on public.seasons;
create policy "seasons read" on public.seasons for select to authenticated
  using (public.is_league_member(league_id));
drop policy if exists "seasons write admin" on public.seasons;
create policy "seasons write admin" on public.seasons for all to authenticated
  using (public.is_league_admin(league_id))
  with check (public.is_league_admin(league_id));

drop policy if exists "sessions read" on public.sessions;
create policy "sessions read" on public.sessions for select to authenticated
  using (public.is_league_member(league_id));
drop policy if exists "sessions write members" on public.sessions;
create policy "sessions write members" on public.sessions for all to authenticated
  using (public.is_league_member(league_id))
  with check (public.is_league_member(league_id));

drop policy if exists "matches read" on public.matches;
create policy "matches read" on public.matches for select to authenticated
  using (public.is_league_member(league_id));
drop policy if exists "matches write members" on public.matches;
create policy "matches write members" on public.matches for all to authenticated
  using (public.is_league_member(league_id))
  with check (public.is_league_member(league_id));

drop policy if exists "validations read" on public.match_validations;
create policy "validations read" on public.match_validations for select to authenticated
  using (
    exists (
      select 1 from public.matches m
      where m.id = match_id and public.is_league_member(m.league_id)
    )
  );
drop policy if exists "validations write self" on public.match_validations;
create policy "validations write self" on public.match_validations for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, update on public.leagues to authenticated;
grant select, insert, update, delete on public.league_members to authenticated;
grant select, insert, update, delete on public.players to authenticated;
grant select, insert, update, delete on public.seasons to authenticated;
grant select, insert, update, delete on public.sessions to authenticated;
grant select, insert, update, delete on public.matches to authenticated;
grant select, insert, update, delete on public.match_validations to authenticated;
grant execute on function public.create_league(text, int) to authenticated;
grant execute on function public.join_league(text) to authenticated;
grant execute on function public.vote_match(uuid, text) to authenticated;
grant execute on function public.refresh_match_status(uuid) to authenticated;
