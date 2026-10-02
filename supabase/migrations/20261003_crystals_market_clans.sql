alter table players add column if not exists crystals integer not null default 0 check (crystals >= 0);
alter table daily_progress add column if not exists bot_wins integer not null default 0;
alter table daily_progress add column if not exists tower_floors integer not null default 0;
alter table daily_progress add column if not exists pvp_wins integer not null default 0;
alter table daily_progress add column if not exists item_upgrades integer not null default 0;

alter table economy_ledger drop constraint if exists economy_ledger_currency_check;
alter table economy_ledger add constraint economy_ledger_currency_check check (currency in ('coins','stars','crystals'));

create or replace function audit_player_crystal_change() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.crystals is distinct from old.crystals then
    insert into economy_ledger(player_id,currency,amount,event_type,metadata)
    values(new.telegram_id,'crystals',new.crystals-old.crystals,'crystal_change','{}'::jsonb);
  end if;
  return new;
end $$;
drop trigger if exists players_crystal_audit on players;
create trigger players_crystal_audit after update of crystals on players for each row execute function audit_player_crystal_change();

create table if not exists market_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id bigint not null references players(telegram_id) on delete cascade,
  buyer_id bigint references players(telegram_id) on delete set null,
  item_id text not null check (item_id in ('block','sword','pet','crystal','crown','secret')),
  price bigint not null check (price between 100 and 2000000),
  fee bigint not null default 0 check (fee >= 0),
  status text not null default 'active' check (status in ('active','sold','cancelled')),
  created_at timestamptz not null default now(),
  sold_at timestamptz
);
create index if not exists market_active_idx on market_listings(status, created_at desc);
create index if not exists market_seller_idx on market_listings(seller_id, created_at desc);
create index if not exists market_buyer_idx on market_listings(buyer_id, created_at desc);

create table if not exists clans (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 18),
  emblem text not null default 'crown' check (emblem in ('crown','shield','sword','fire','galaxy','gem')),
  owner_id bigint not null unique references players(telegram_id) on delete cascade,
  level integer not null default 1 check (level between 1 and 20),
  xp bigint not null default 0 check (xp >= 0),
  season_points bigint not null default 0 check (season_points >= 0),
  created_at timestamptz not null default now()
);
create unique index if not exists clans_name_lower_idx on clans(lower(name));

create table if not exists clan_members (
  clan_id uuid not null references clans(id) on delete cascade,
  player_id bigint primary key references players(telegram_id) on delete cascade,
  role text not null default 'member' check (role in ('owner','officer','member')),
  contribution bigint not null default 0 check (contribution >= 0),
  joined_at timestamptz not null default now()
);
create index if not exists clan_members_clan_idx on clan_members(clan_id, contribution desc);

create table if not exists clan_raids (
  id uuid primary key default gen_random_uuid(),
  clan_id uuid not null references clans(id) on delete cascade,
  week_key text not null,
  boss_name text not null default 'Титан Бездны',
  max_hp bigint not null check (max_hp > 0),
  current_hp bigint not null check (current_hp >= 0),
  reward_crystals integer not null default 50 check (reward_crystals > 0),
  status text not null default 'active' check (status in ('active','defeated')),
  created_at timestamptz not null default now(),
  defeated_at timestamptz,
  unique(clan_id, week_key)
);

create table if not exists clan_raid_attacks (
  id bigserial primary key,
  raid_id uuid not null references clan_raids(id) on delete cascade,
  player_id bigint not null references players(telegram_id) on delete cascade,
  damage bigint not null check (damage > 0),
  created_at timestamptz not null default now()
);
create index if not exists clan_raid_attacks_idx on clan_raid_attacks(raid_id, player_id, created_at desc);

create table if not exists clan_wars (
  id uuid primary key default gen_random_uuid(),
  season_key text not null,
  clan_one uuid not null references clans(id) on delete cascade,
  clan_two uuid not null references clans(id) on delete cascade,
  points_one integer not null default 0,
  points_two integer not null default 0,
  status text not null default 'active' check (status in ('active','finished')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null default (now() + interval '7 days'),
  check (clan_one <> clan_two)
);
create index if not exists clan_wars_active_idx on clan_wars(status, ends_at);

create table if not exists clan_war_attacks (
  id bigserial primary key,
  war_id uuid not null references clan_wars(id) on delete cascade,
  clan_id uuid not null references clans(id) on delete cascade,
  player_id bigint not null references players(telegram_id) on delete cascade,
  points integer not null check (points > 0),
  won boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function increment_daily_progress(p_id bigint, p_field text, p_amount integer default 1) returns void
language plpgsql security definer set search_path=public as $$
begin
  insert into daily_progress(player_id,day) values(p_id,current_date) on conflict do nothing;
  if p_field='bot_wins' then update daily_progress set bot_wins=bot_wins+p_amount where player_id=p_id and day=current_date;
  elsif p_field='tower_floors' then update daily_progress set tower_floors=tower_floors+p_amount where player_id=p_id and day=current_date;
  elsif p_field='pvp_wins' then update daily_progress set pvp_wins=pvp_wins+p_amount where player_id=p_id and day=current_date;
  elsif p_field='item_upgrades' then update daily_progress set item_upgrades=item_upgrades+p_amount where player_id=p_id and day=current_date;
  else raise exception 'Invalid daily progress field'; end if;
end $$;

create or replace function claim_daily_mission(p_id bigint, p_mission text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  progress integer;
  target integer;
  coins bigint;
begin
  if exists(select 1 from mission_claims where player_id=p_id and period=current_date::text and mission_id=p_mission) then raise exception 'Задание уже получено'; end if;
  select case p_mission
    when 'bots3' then bot_wins when 'spins3' then spins when 'tower1' then tower_floors
    when 'pvp1' then pvp_wins when 'upgrade1' then item_upgrades else -1 end
  into progress from daily_progress where player_id=p_id and day=current_date;
  target:=case p_mission when 'bots3' then 3 when 'spins3' then 3 when 'tower1' then 1 when 'pvp1' then 1 when 'upgrade1' then 1 else 999999 end;
  coins:=case p_mission when 'bots3' then 1000 when 'spins3' then 600 when 'tower1' then 1200 when 'pvp1' then 1500 when 'upgrade1' then 800 else 0 end;
  if coalesce(progress,0)<target then raise exception 'Задание ещё не выполнено'; end if;
  insert into mission_claims(player_id,period,mission_id) values(p_id,current_date::text,p_mission);
  update players set balance=balance+coins,crystals=crystals+1,xp=xp+25 where telegram_id=p_id;
  perform apply_player_levels(p_id);
  return player_snapshot(p_id)||jsonb_build_object('event',jsonb_build_object('action','claim_mission','reward',coins,'crystals',1));
end $$;

create or replace function grant_claim_crystals(p_id bigint, p_kind text, p_key text, p_amount integer) returns integer
language plpgsql security definer set search_path=public as $$
declare marker text := 'crystal_'||p_kind||'_'||p_key;
begin
  if exists(select 1 from mission_claims where player_id=p_id and period='crystal_grants' and mission_id=marker) then return 0; end if;
  insert into mission_claims(player_id,period,mission_id) values(p_id,'crystal_grants',marker);
  update players set crystals=crystals+greatest(0,p_amount) where telegram_id=p_id;
  return greatest(0,p_amount);
end $$;

create or replace function market_trade(p_player_id bigint, p_action text, p_payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  listing market_listings%rowtype;
  item text := p_payload->>'item_id';
  asking bigint := coalesce((p_payload->>'price')::bigint,0);
  player players%rowtype;
  owned integer;
  active_count integer;
  commission bigint;
begin
  select * into player from players where telegram_id=p_player_id for update;
  if not found or player.blocked then raise exception 'Player unavailable'; end if;
  if p_action='sell' then
    if player.level<2 then raise exception 'Рынок открывается со 2 уровня'; end if;
    if item not in ('block','sword','pet','crystal','crown','secret') or asking not between 100 and 2000000 then raise exception 'Неверные параметры объявления'; end if;
    select count(*) into active_count from market_listings where seller_id=p_player_id and status='active';
    if active_count>=5 then raise exception 'Можно разместить не больше 5 предметов'; end if;
    select count into owned from inventory where player_id=p_player_id and item_id=item for update;
    if coalesce(owned,0)<1 then raise exception 'Предмета нет в инвентаре'; end if;
    if player.equipped_id=item and owned=1 then raise exception 'Сначала сними предмет'; end if;
    update inventory set count=count-1 where player_id=p_player_id and item_id=item;
    insert into market_listings(seller_id,item_id,price) values(p_player_id,item,asking) returning * into listing;
  elsif p_action='buy' then
    select * into listing from market_listings where id=(p_payload->>'listing_id')::uuid for update;
    if not found or listing.status<>'active' then raise exception 'Объявление уже недоступно'; end if;
    if listing.seller_id=p_player_id then raise exception 'Нельзя купить свой предмет'; end if;
    if player.balance<listing.price then raise exception 'Недостаточно Blox Coins'; end if;
    commission:=greatest(1,floor(listing.price*.10));
    update players set balance=balance-listing.price where telegram_id=p_player_id;
    update players set balance=balance+listing.price-commission where telegram_id=listing.seller_id;
    insert into inventory(player_id,item_id,count) values(p_player_id,listing.item_id,1)
      on conflict(player_id,item_id) do update set count=inventory.count+1,discovered=true;
    update market_listings set buyer_id=p_player_id,fee=commission,status='sold',sold_at=now() where id=listing.id returning * into listing;
  elsif p_action='cancel' then
    select * into listing from market_listings where id=(p_payload->>'listing_id')::uuid for update;
    if not found or listing.status<>'active' or listing.seller_id<>p_player_id then raise exception 'Объявление недоступно'; end if;
    update market_listings set status='cancelled' where id=listing.id returning * into listing;
    insert into inventory(player_id,item_id,count) values(p_player_id,listing.item_id,1)
      on conflict(player_id,item_id) do update set count=inventory.count+1,discovered=true;
  else raise exception 'Unknown market action'; end if;
  return to_jsonb(listing);
end $$;

alter table market_listings enable row level security;
alter table clans enable row level security;
alter table clan_members enable row level security;
alter table clan_raids enable row level security;
alter table clan_raid_attacks enable row level security;
alter table clan_wars enable row level security;
alter table clan_war_attacks enable row level security;

grant all on market_listings, clans, clan_members, clan_raids, clan_raid_attacks, clan_wars, clan_war_attacks to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on function increment_daily_progress(bigint,text,integer) to service_role;
grant execute on function market_trade(bigint,text,jsonb) to service_role;
grant execute on function claim_daily_mission(bigint,text) to service_role;
grant execute on function grant_claim_crystals(bigint,text,text,integer) to service_role;
