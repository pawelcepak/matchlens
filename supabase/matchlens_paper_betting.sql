-- MatchLens Paper Betting / Supabase schema
-- Run this file in Supabase SQL Editor once.

create extension if not exists pgcrypto;

create table if not exists public.matchlens_paper_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  start_balance numeric(14,2) not null default 1000.00 check (start_balance >= 0),
  cash numeric(14,2) not null default 1000.00 check (cash >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.matchlens_coupons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  stake numeric(14,2) not null check (stake > 0),
  odds numeric(14,4) not null check (odds >= 1.01),
  potential numeric(14,2) not null check (potential >= 0),
  status text not null default 'pending' check (status in ('pending','won','lost','void')),
  payout numeric(14,2) not null default 0 check (payout >= 0),
  net numeric(14,2) not null default 0,
  settled_at timestamptz,
  model_version text,
  created_device text
);

create table if not exists public.matchlens_coupon_legs (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.matchlens_coupons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  position integer not null check (position >= 0),
  match_name text not null,
  pick text not null,
  odd numeric(14,4) not null check (odd >= 1.01),
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(coupon_id, position)
);

create index if not exists matchlens_coupons_user_created_idx
  on public.matchlens_coupons(user_id, created_at desc);
create index if not exists matchlens_coupon_legs_coupon_idx
  on public.matchlens_coupon_legs(coupon_id, position);

alter table public.matchlens_paper_accounts enable row level security;
alter table public.matchlens_coupons enable row level security;
alter table public.matchlens_coupon_legs enable row level security;

drop policy if exists "matchlens account select own" on public.matchlens_paper_accounts;
create policy "matchlens account select own"
  on public.matchlens_paper_accounts for select
  using (auth.uid() = user_id);

drop policy if exists "matchlens account insert own" on public.matchlens_paper_accounts;
create policy "matchlens account insert own"
  on public.matchlens_paper_accounts for insert
  with check (auth.uid() = user_id);

drop policy if exists "matchlens account update own" on public.matchlens_paper_accounts;
create policy "matchlens account update own"
  on public.matchlens_paper_accounts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "matchlens coupons select own" on public.matchlens_coupons;
create policy "matchlens coupons select own"
  on public.matchlens_coupons for select
  using (auth.uid() = user_id);

drop policy if exists "matchlens legs select own" on public.matchlens_coupon_legs;
create policy "matchlens legs select own"
  on public.matchlens_coupon_legs for select
  using (auth.uid() = user_id);

-- Writes are done through SECURITY DEFINER RPC functions below. Direct client
-- insert/update/delete policies are intentionally not created.

create or replace function public.matchlens_touch_account()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists matchlens_paper_accounts_touch on public.matchlens_paper_accounts;
create trigger matchlens_paper_accounts_touch
before update on public.matchlens_paper_accounts
for each row execute function public.matchlens_touch_account();

create or replace function public.matchlens_ensure_account()
returns public.matchlens_paper_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  result public.matchlens_paper_accounts;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  insert into public.matchlens_paper_accounts(user_id, start_balance, cash)
  values (uid, 1000.00, 1000.00)
  on conflict (user_id) do nothing;
  select * into result from public.matchlens_paper_accounts where user_id = uid;
  return result;
end;
$$;

create or replace function public.matchlens_place_coupon(
  p_stake numeric,
  p_legs jsonb,
  p_model_version text default null,
  p_created_device text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  account public.matchlens_paper_accounts;
  coupon_id uuid;
  total_odds numeric := 1;
  leg jsonb;
  idx integer := 0;
  leg_odd numeric;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_stake is null or p_stake <= 0 then raise exception 'invalid stake'; end if;
  if p_legs is null or jsonb_typeof(p_legs) <> 'array' or jsonb_array_length(p_legs) = 0 then
    raise exception 'coupon requires at least one leg';
  end if;

  perform public.matchlens_ensure_account();
  select * into account from public.matchlens_paper_accounts where user_id = uid for update;
  if account.cash < p_stake then raise exception 'insufficient virtual funds'; end if;

  for leg in select value from jsonb_array_elements(p_legs)
  loop
    leg_odd := (leg->>'odd')::numeric;
    if leg_odd is null or leg_odd < 1.01 then raise exception 'invalid odd'; end if;
    if coalesce(trim(leg->>'match'), '') = '' then raise exception 'missing match'; end if;
    if coalesce(trim(leg->>'pick'), '') = '' then raise exception 'missing pick'; end if;
    total_odds := total_odds * leg_odd;
  end loop;

  insert into public.matchlens_coupons(user_id, stake, odds, potential, model_version, created_device)
  values (uid, round(p_stake,2), total_odds, round(p_stake * total_odds,2), p_model_version, p_created_device)
  returning id into coupon_id;

  idx := 0;
  for leg in select value from jsonb_array_elements(p_legs)
  loop
    insert into public.matchlens_coupon_legs(coupon_id, user_id, position, match_name, pick, odd, snapshot)
    values (
      coupon_id, uid, idx,
      leg->>'match', leg->>'pick', (leg->>'odd')::numeric,
      coalesce(leg->'snapshot', '{}'::jsonb)
    );
    idx := idx + 1;
  end loop;

  update public.matchlens_paper_accounts set cash = cash - round(p_stake,2) where user_id = uid;
  return coupon_id;
end;
$$;

create or replace function public.matchlens_settle_coupon(p_coupon_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  c public.matchlens_coupons;
  pay numeric := 0;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_status not in ('won','lost','void') then raise exception 'invalid status'; end if;
  select * into c from public.matchlens_coupons where id = p_coupon_id and user_id = uid for update;
  if c.id is null then raise exception 'coupon not found'; end if;
  if c.status <> 'pending' then raise exception 'coupon already settled'; end if;

  if p_status = 'won' then pay := round(c.stake * c.odds,2);
  elsif p_status = 'void' then pay := c.stake;
  else pay := 0;
  end if;

  update public.matchlens_coupons
  set status = p_status,
      payout = pay,
      net = case when p_status='won' then pay-c.stake when p_status='lost' then -c.stake else 0 end,
      settled_at = now()
  where id = c.id;

  if pay > 0 then
    update public.matchlens_paper_accounts set cash = cash + pay where user_id = uid;
  end if;
end;
$$;

create or replace function public.matchlens_delete_coupon(p_coupon_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  c public.matchlens_coupons;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into c from public.matchlens_coupons where id = p_coupon_id and user_id = uid for update;
  if c.id is null then raise exception 'coupon not found'; end if;
  if c.status = 'pending' then
    update public.matchlens_paper_accounts set cash = cash + c.stake where user_id = uid;
  end if;
  delete from public.matchlens_coupons where id = c.id;
end;
$$;

create or replace function public.matchlens_reset_paper()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  delete from public.matchlens_coupons where user_id = uid;
  insert into public.matchlens_paper_accounts(user_id, start_balance, cash)
  values (uid,1000.00,1000.00)
  on conflict (user_id) do update set start_balance=1000.00,cash=1000.00,updated_at=now();
end;
$$;

grant execute on function public.matchlens_ensure_account() to authenticated;
grant execute on function public.matchlens_place_coupon(numeric,jsonb,text,text) to authenticated;
grant execute on function public.matchlens_settle_coupon(uuid,text) to authenticated;
grant execute on function public.matchlens_delete_coupon(uuid) to authenticated;
grant execute on function public.matchlens_reset_paper() to authenticated;
