create extension if not exists pgcrypto;

create table if not exists players (
  telegram_id bigint primary key,
  username text not null default '',
  display_name text not null default 'Player',
  photo_url text not null default '',
  balance bigint not null default 5000 check (balance >= 0),
  level integer not null default 1 check (level > 0),
  xp integer not null default 0 check (xp >= 0),
  spins integer not null default 0,
  wins integer not null default 0,
  total_won bigint not null default 0,
  best_win bigint not null default 0,
  total_wagered bigint not null default 0,
  bet integer not null default 100,
  equipped_id text not null default '',
  upgrades jsonb not null default '{"luck":0,"xp":0}'::jsonb,
  daily_date date,
  daily_streak integer not null default 0,
  rescue_date date,
  referral_code text unique,
  referred_by bigint references players(telegram_id),
  blocked boolean not null default false,
  is_owner boolean not null default false,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create table if not exists inventory (
  player_id bigint not null references players(telegram_id) on delete cascade,
  item_id text not null,
  count integer not null default 0 check (count >= 0),
  discovered boolean not null default true,
  primary key (player_id, item_id)
);

create table if not exists spin_history (
  id bigserial primary key,
  player_id bigint not null references players(telegram_id) on delete cascade,
  symbols text[] not null,
  bet integer not null,
  win bigint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists spin_history_player_idx on spin_history(player_id, created_at desc);

create table if not exists daily_progress (
  player_id bigint not null references players(telegram_id) on delete cascade,
  day date not null default current_date,
  spins integer not null default 0,
  wins integer not null default 0,
  items integer not null default 0,
  primary key (player_id, day)
);
create table if not exists mission_claims (
  player_id bigint not null references players(telegram_id) on delete cascade,
  period text not null,
  mission_id text not null,
  claimed_at timestamptz not null default now(),
  primary key (player_id, period, mission_id)
);
create table if not exists weekly_progress (
  player_id bigint not null references players(telegram_id) on delete cascade,
  week_key text not null,
  spins integer not null default 0,
  wins integer not null default 0,
  items integer not null default 0,
  primary key (player_id, week_key)
);
create table if not exists season_progress (
  player_id bigint not null references players(telegram_id) on delete cascade,
  season_key text not null,
  points integer not null default 0,
  claimed jsonb not null default '{}'::jsonb,
  primary key (player_id, season_key)
);

create table if not exists referrals (
  inviter_id bigint not null references players(telegram_id) on delete cascade,
  invitee_id bigint primary key references players(telegram_id) on delete cascade,
  rewarded_at timestamptz not null default now()
);
create table if not exists promo_codes (
  code text primary key,
  reward bigint not null check (reward > 0),
  max_uses integer not null default 100,
  uses integer not null default 0,
  expires_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists promo_redemptions (
  code text not null references promo_codes(code) on delete cascade,
  player_id bigint not null references players(telegram_id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key (code, player_id)
);

create table if not exists tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  active boolean not null default true,
  reward_pool bigint not null default 10000,
  created_at timestamptz not null default now()
);
create table if not exists tournament_entries (
  tournament_id uuid not null references tournaments(id) on delete cascade,
  player_id bigint not null references players(telegram_id) on delete cascade,
  score bigint not null default 0,
  joined_at timestamptz not null default now(),
  primary key (tournament_id, player_id)
);

create table if not exists pvp_queue (
  player_id bigint primary key references players(telegram_id) on delete cascade,
  rating integer not null default 1000,
  power integer not null default 0,
  snapshot jsonb not null default '{}'::jsonb,
  joined_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index if not exists pvp_queue_match_idx on pvp_queue(rating, joined_at);

create table if not exists pvp_matches (
  id uuid primary key default gen_random_uuid(),
  player_one bigint not null references players(telegram_id) on delete cascade,
  player_two bigint not null references players(telegram_id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','finished','cancelled')),
  winner_id bigint references players(telegram_id),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pvp_matches_player_one_idx on pvp_matches(player_one, updated_at desc);
create index if not exists pvp_matches_player_two_idx on pvp_matches(player_two, updated_at desc);
create index if not exists pvp_matches_active_one_idx on pvp_matches(player_one, updated_at desc) where status='active';
create index if not exists pvp_matches_active_two_idx on pvp_matches(player_two, updated_at desc) where status='active';

create table if not exists game_config (
  id boolean primary key default true check (id),
  config jsonb not null default '{"spin_enabled":true,"chest_cost":1000,"referral_inviter":1000,"referral_invitee":500}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into game_config(id) values(true) on conflict do nothing;

create table if not exists admin_audit (
  id bigserial primary key,
  admin_id bigint not null,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists star_orders (
  id uuid primary key default gen_random_uuid(),
  player_id bigint not null references players(telegram_id) on delete cascade,
  product_id text not null,
  stars integer not null check (stars > 0),
  payload text not null unique,
  status text not null default 'pending' check (status in ('pending','processing','paid','cancelled','refunded')),
  telegram_charge_id text unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create table if not exists economy_ledger (
  id bigserial primary key,
  player_id bigint not null references players(telegram_id) on delete cascade,
  currency text not null default 'coins' check (currency in ('coins','stars')),
  amount bigint not null,
  event_type text not null default 'balance_change',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists star_orders_player_created_idx on star_orders(player_id, created_at desc);
create index if not exists star_orders_pending_idx on star_orders(status, created_at) where status in ('pending','processing');
create index if not exists economy_ledger_player_created_idx on economy_ledger(player_id, created_at desc);
create index if not exists economy_ledger_daily_coins_idx on economy_ledger(player_id, created_at) where currency='coins';

create or replace function audit_player_balance_change() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.balance is distinct from old.balance then
    insert into economy_ledger(player_id,currency,amount,event_type,metadata)
    values(new.telegram_id,'coins',new.balance-old.balance,coalesce(nullif(current_setting('app.economy_event',true),''),'balance_change'),'{}'::jsonb);
  end if;
  return new;
end $$;

drop trigger if exists players_balance_audit on players;
create trigger players_balance_audit after update of balance on players for each row execute function audit_player_balance_change();

alter table players enable row level security;
alter table inventory enable row level security;
alter table spin_history enable row level security;
alter table daily_progress enable row level security;
alter table mission_claims enable row level security;
alter table weekly_progress enable row level security;
alter table season_progress enable row level security;
alter table referrals enable row level security;
alter table promo_codes enable row level security;
alter table promo_redemptions enable row level security;
alter table tournaments enable row level security;
alter table tournament_entries enable row level security;
alter table pvp_queue enable row level security;
alter table pvp_matches enable row level security;
alter table star_orders enable row level security;
alter table economy_ledger enable row level security;
alter table game_config enable row level security;
alter table admin_audit enable row level security;

create or replace function current_week_key() returns text language sql stable as $$
  select to_char(current_date - (extract(isodow from current_date)::int - 1), 'YYYY-MM-DD');
$$;
create or replace function current_season_key() returns text language sql stable as $$
  select to_char(current_date, 'YYYY-MM');
$$;

create or replace function apply_player_levels(p_id bigint) returns void
language plpgsql security definer set search_path=public as $$
declare current_xp integer; current_level integer;
begin
  loop
    select xp,level into current_xp,current_level from players where telegram_id=p_id for update;
    exit when current_xp < current_level*100;
    update players set xp=xp-current_level*100,level=level+1 where telegram_id=p_id;
  end loop;
end $$;

create or replace function player_snapshot(p_id bigint) returns jsonb
language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  select jsonb_build_object(
    'player', to_jsonb(p),
    'inventory', coalesce((select jsonb_object_agg(i.item_id, i.count) from inventory i where i.player_id=p_id and i.count>0), '{}'::jsonb),
    'discovered', coalesce((select jsonb_object_agg(i.item_id, i.discovered) from inventory i where i.player_id=p_id and i.discovered), '{}'::jsonb),
    'history', coalesce((select jsonb_agg(x order by x.created_at desc) from (select symbols,bet,win,created_at from spin_history where player_id=p_id order by created_at desc limit 10) x), '[]'::jsonb),
    'daily', coalesce((select to_jsonb(d) from daily_progress d where d.player_id=p_id and d.day=current_date), jsonb_build_object('spins',0,'wins',0,'items',0)),
    'weekly', coalesce((select to_jsonb(w) from weekly_progress w where w.player_id=p_id and w.week_key=current_week_key()), jsonb_build_object('spins',0,'wins',0,'items',0,'week_key',current_week_key())),
    'season', coalesce((select to_jsonb(s) from season_progress s where s.player_id=p_id and s.season_key=current_season_key()), jsonb_build_object('points',0,'claimed','{}'::jsonb,'season_key',current_season_key())),
    'claims', jsonb_build_object(
      'daily', coalesce((select jsonb_agg(mission_id) from mission_claims where player_id=p_id and period=current_date::text),'[]'::jsonb),
      'weekly', coalesce((select jsonb_agg(mission_id) from mission_claims where player_id=p_id and period=current_week_key()),'[]'::jsonb),
      'once', coalesce((select jsonb_agg(mission_id) from mission_claims where player_id=p_id and period='once'),'[]'::jsonb)
    ),
    'leaderboard', coalesce((select jsonb_agg(to_jsonb(l)) from (select telegram_id,display_name,username,balance,level from players where not blocked order by balance desc limit 50) l), '[]'::jsonb),
    'tournament', (select jsonb_build_object('id',t.id,'name',t.name,'ends_at',t.ends_at,'reward_pool',t.reward_pool,'joined',exists(select 1 from tournament_entries e where e.tournament_id=t.id and e.player_id=p_id),'leaders',coalesce((select jsonb_agg(to_jsonb(q)) from (select p.display_name,e.score from tournament_entries e join players p on p.telegram_id=e.player_id where e.tournament_id=t.id order by e.score desc limit 20) q),'[]'::jsonb)) from tournaments t where t.active and now() between t.starts_at and t.ends_at order by t.ends_at limit 1),
    'referral', jsonb_build_object('code',(select referral_code from players where telegram_id=p_id),'count',(select count(*) from referrals where inviter_id=p_id)),
    'server_time', now()
  ) into result from players p where p.telegram_id=p_id;
  return result;
end $$;

create or replace function bootstrap_player(p_user jsonb, p_start_param text default '', p_is_owner boolean default false) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  uid bigint := (p_user->>'id')::bigint;
  uname text := coalesce(p_user->>'username','');
  dname text := trim(concat_ws(' ',p_user->>'first_name',p_user->>'last_name'));
  inviter bigint;
begin
  if dname='' then dname:=coalesce(nullif(uname,''),'Player'); end if;
  insert into players(telegram_id,username,display_name,photo_url,referral_code,is_owner,balance)
  values(uid,uname,dname,coalesce(p_user->>'photo_url',''),'ref_'||substr(md5(uid::text),1,8),p_is_owner,case when p_is_owner then 10000000 else 5000 end)
  on conflict(telegram_id) do update set username=excluded.username,display_name=excluded.display_name,photo_url=excluded.photo_url,last_seen=now(),is_owner=players.is_owner or excluded.is_owner,balance=case when excluded.is_owner then greatest(players.balance,10000000) else players.balance end;
  if coalesce(p_start_param,'') like 'ref_%' and not exists(select 1 from referrals where invitee_id=uid) then
    select telegram_id into inviter from players where referral_code=lower(p_start_param) and telegram_id<>uid;
    if inviter is not null then
      insert into referrals(inviter_id,invitee_id) values(inviter,uid) on conflict do nothing;
      update players set balance=balance+1000 where telegram_id=inviter;
      update players set balance=balance+500,referred_by=inviter where telegram_id=uid;
    end if;
  end if;
  insert into daily_progress(player_id,day) values(uid,current_date) on conflict do nothing;
  insert into weekly_progress(player_id,week_key) values(uid,current_week_key()) on conflict do nothing;
  insert into season_progress(player_id,season_key) values(uid,current_season_key()) on conflict do nothing;
  return player_snapshot(uid);
end $$;

create or replace function game_action(p_telegram_id bigint, p_action text, p_payload jsonb default '{}'::jsonb, p_is_owner boolean default false) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  p players%rowtype;
  b integer;
  s text[] := array['block','sword','pet','crystal','crown','secret'];
  a text; c text; d text;
  base bigint := 0; win_amount bigint := 0; bonus integer := 0;
  drop_id text; chance numeric; roll numeric;
  mission text; reward_amount bigint; prog integer; claimed boolean;
  item text; item_value integer; item_bonus integer;
  lvl integer; cost bigint; code_value text;
  season_level integer; threshold integer;
  active_tournament_id uuid;
begin
  select * into p from players where telegram_id=p_telegram_id for update;
  if not found then raise exception 'Player not found'; end if;
  if p.blocked then raise exception 'Account is blocked'; end if;
  if p_is_owner and p.balance<10000000 then update players set balance=10000000,is_owner=true where telegram_id=p_telegram_id; p.balance:=10000000; end if;

  if p_action='spin' then
    b:=coalesce((p_payload->>'bet')::integer,p.bet);
    if b not in (100,250,500) then raise exception 'Invalid bet'; end if;
    if p.balance<b then raise exception 'Not enough coins'; end if;
    a:=s[1+floor(random()*6)::int]; c:=s[1+floor(random()*6)::int]; d:=s[1+floor(random()*6)::int];
    if a=c and c=d then base:=case a when 'crown' then 10000 when 'crystal' then 5000 else 1500 end; elsif a=c or c=d or a=d then base:=150; end if;
    item_bonus:=case p.equipped_id when 'block' then 5 when 'sword' then 10 when 'pet' then 15 when 'crystal' then 25 when 'crown' then 40 when 'secret' then 75 else 0 end;
    win_amount:=floor(base*(b/100.0)*(1+item_bonus/100.0));
    chance:=least(.75,.38+(b/100-1)*.03+coalesce((p.upgrades->>'luck')::int,0)*.03);
    if random()<chance then
      roll:=random()*100;
      drop_id:=case when roll<68 then 'block' when roll<92 then 'sword' when roll<98.5 then 'pet' when roll<99.7 then 'crystal' when roll<99.98 then 'crown' else 'secret' end;
      insert into inventory(player_id,item_id,count) values(p_telegram_id,drop_id,1) on conflict(player_id,item_id) do update set count=inventory.count+1,discovered=true;
    end if;
    update players set balance=balance-b+win_amount,bet=b,spins=spins+1,wins=wins+case when win_amount>0 then 1 else 0 end,total_won=total_won+win_amount,best_win=greatest(best_win,win_amount),total_wagered=total_wagered+b,xp=xp+20+coalesce((upgrades->>'xp')::int,0)*5+case when win_amount>0 then 25 else 0 end where telegram_id=p_telegram_id;
    insert into spin_history(player_id,symbols,bet,win) values(p_telegram_id,array[a,c,d],b,win_amount);
    insert into daily_progress(player_id,day,spins,wins,items) values(p_telegram_id,current_date,1,case when win_amount>0 then 1 else 0 end,case when drop_id is null then 0 else 1 end) on conflict(player_id,day) do update set spins=daily_progress.spins+1,wins=daily_progress.wins+excluded.wins,items=daily_progress.items+excluded.items;
    insert into weekly_progress(player_id,week_key,spins,wins,items) values(p_telegram_id,current_week_key(),1,case when win_amount>0 then 1 else 0 end,case when drop_id is null then 0 else 1 end) on conflict(player_id,week_key) do update set spins=weekly_progress.spins+1,wins=weekly_progress.wins+excluded.wins,items=weekly_progress.items+excluded.items;
    insert into season_progress(player_id,season_key,points) values(p_telegram_id,current_season_key(),10+case when win_amount>0 then 15 else 0 end) on conflict(player_id,season_key) do update set points=season_progress.points+excluded.points;
    update tournament_entries te set score=te.score+win_amount where te.player_id=p_telegram_id and te.tournament_id in(select t.id from tournaments t where t.active and now() between t.starts_at and t.ends_at);
    perform apply_player_levels(p_telegram_id);
    return player_snapshot(p_telegram_id)||jsonb_build_object('event',jsonb_build_object('symbols',array[a,c,d],'win',win_amount,'drop',drop_id));
  elsif p_action='claim_daily' then
    if p.daily_date=current_date then raise exception 'Daily reward already claimed'; end if;
    reward_amount:=least(2500,1000+(case when p.daily_date=current_date-1 then p.daily_streak else 0 end)*250);
    update players set balance=balance+reward_amount,daily_streak=case when daily_date=current_date-1 then daily_streak+1 else 1 end,daily_date=current_date where telegram_id=p_telegram_id;
  elsif p_action='claim_mission' then
    mission:=p_payload->>'id';
    select exists(select 1 from mission_claims where player_id=p_telegram_id and period=current_date::text and mission_id=mission) into claimed;
    if claimed then raise exception 'Mission already claimed'; end if;
    select case mission when 'spins3' then spins when 'win1' then wins when 'item1' then items else -1 end into prog from daily_progress where player_id=p_telegram_id and day=current_date;
    reward_amount:=case mission when 'spins3' then 300 when 'win1' then 500 when 'item1' then 700 else 0 end;
    if prog < (case mission when 'spins3' then 3 when 'win1' then 1 when 'item1' then 1 else 999999 end) then raise exception 'Mission is incomplete'; end if;
    insert into mission_claims values(p_telegram_id,current_date::text,mission,now()); update players set balance=balance+reward_amount,xp=xp+25 where telegram_id=p_telegram_id;
  elsif p_action='buy_upgrade' then
    item:=p_payload->>'type'; if item not in ('luck','xp') then raise exception 'Invalid upgrade'; end if;
    lvl:=coalesce((p.upgrades->>item)::int,0); if lvl>=5 then raise exception 'Upgrade is maxed'; end if;
    cost:=(case item when 'luck' then 1000 else 800 end)*(lvl+1); if p.balance<cost then raise exception 'Not enough coins'; end if;
    update players set balance=balance-cost,upgrades=jsonb_set(upgrades,array[item],to_jsonb(lvl+1)) where telegram_id=p_telegram_id;
  elsif p_action='item_action' then
    item:=p_payload->>'item_id';
    if not exists(select 1 from inventory where player_id=p_telegram_id and item_id=item and count>0) then raise exception 'Item not owned'; end if;
    if p_payload->>'mode'='equip' then update players set equipped_id=case when equipped_id=item then '' else item end where telegram_id=p_telegram_id;
    elsif p_payload->>'mode'='sell' then
      item_value:=floor((case item when 'block' then 50 when 'sword' then 150 when 'pet' then 400 when 'crystal' then 900 when 'crown' then 2000 when 'secret' then 5000 else 0 end)*0.9);
      update inventory set count=count-1 where player_id=p_telegram_id and item_id=item; update players set balance=balance+item_value,equipped_id=case when equipped_id=item and not exists(select 1 from inventory where player_id=p_telegram_id and item_id=item and count>0) then '' else equipped_id end where telegram_id=p_telegram_id;
    else raise exception 'Invalid item action'; end if;
  elsif p_action='rescue' then
    if p.balance>=100 or p.rescue_date=current_date then raise exception 'Rescue is unavailable'; end if; update players set balance=balance+1000,rescue_date=current_date,bet=100 where telegram_id=p_telegram_id;
  elsif p_action='open_chest' then
    cost:=1000; if p.balance<cost then raise exception 'Not enough coins'; end if;
    roll:=random()*100; drop_id:=case when roll<45 then 'sword' when roll<72 then 'pet' when roll<88 then 'crystal' when roll<97 then 'crown' else 'secret' end;
    update players set balance=balance-cost where telegram_id=p_telegram_id; insert into inventory(player_id,item_id,count) values(p_telegram_id,drop_id,1) on conflict(player_id,item_id) do update set count=inventory.count+1,discovered=true;
    return player_snapshot(p_telegram_id)||jsonb_build_object('event',jsonb_build_object('chest_item',drop_id));
  elsif p_action='claim_weekly' then
    mission:=p_payload->>'id'; select exists(select 1 from mission_claims where player_id=p_telegram_id and period=current_week_key() and mission_id=mission) into claimed; if claimed then raise exception 'Weekly reward already claimed'; end if;
    select case mission when 'weekly_spins' then spins when 'weekly_wins' then wins when 'weekly_items' then items else -1 end into prog from weekly_progress where player_id=p_telegram_id and week_key=current_week_key();
    threshold:=case mission when 'weekly_spins' then 50 when 'weekly_wins' then 10 when 'weekly_items' then 8 else 999999 end; reward_amount:=case mission when 'weekly_spins' then 3000 when 'weekly_wins' then 5000 when 'weekly_items' then 7000 else 0 end;
    if prog<threshold then raise exception 'Weekly mission is incomplete'; end if; insert into mission_claims values(p_telegram_id,current_week_key(),mission,now()); update players set balance=balance+reward_amount where telegram_id=p_telegram_id;
  elsif p_action='claim_season' then
    season_level:=(p_payload->>'level')::int; threshold:=season_level*100; reward_amount:=season_level*1000;
    if coalesce((select points from season_progress where player_id=p_telegram_id and season_key=current_season_key()),0)<threshold then raise exception 'Season level is locked'; end if;
    if coalesce((select sp.claimed ? season_level::text from season_progress sp where sp.player_id=p_telegram_id and sp.season_key=current_season_key()),false) then raise exception 'Season reward already claimed'; end if;
    update season_progress sp set claimed=sp.claimed||jsonb_build_object(season_level::text,true) where sp.player_id=p_telegram_id and sp.season_key=current_season_key(); update players set balance=balance+reward_amount where telegram_id=p_telegram_id;
  elsif p_action='redeem_promo' then
    code_value:=upper(trim(p_payload->>'code')); select pc.reward into reward_amount from promo_codes pc where pc.code=code_value and pc.active and pc.uses<pc.max_uses and (pc.expires_at is null or pc.expires_at>now()) for update;
    if reward_amount is null then raise exception 'Promo code is invalid'; end if; if exists(select 1 from promo_redemptions where code=code_value and player_id=p_telegram_id) then raise exception 'Promo code already used'; end if;
    insert into promo_redemptions values(code_value,p_telegram_id,now()); update promo_codes set uses=uses+1 where code=code_value; update players set balance=balance+reward_amount where telegram_id=p_telegram_id;
  elsif p_action='tournament_join' then
    select t.id into active_tournament_id from tournaments t where t.active and now() between t.starts_at and t.ends_at order by t.ends_at limit 1; if active_tournament_id is null then raise exception 'No active tournament'; end if; insert into tournament_entries(tournament_id,player_id) values(active_tournament_id,p_telegram_id) on conflict do nothing;
  elsif p_action='claim_league' then
    mission:='league_'||lower(p_payload->>'id'); select exists(select 1 from mission_claims where player_id=p_telegram_id and period='once' and mission_id=mission) into claimed; if claimed then raise exception 'League reward already claimed'; end if;
    threshold:=case p_payload->>'id' when 'Bronze' then 0 when 'Silver' then 10000 when 'Gold' then 50000 when 'Diamond' then 150000 else 999999999 end; reward_amount:=case p_payload->>'id' when 'Bronze' then 500 when 'Silver' then 1500 when 'Gold' then 5000 when 'Diamond' then 15000 else 0 end; if p.balance<threshold then raise exception 'League is locked'; end if; insert into mission_claims values(p_telegram_id,'once',mission,now()); update players set balance=balance+reward_amount where telegram_id=p_telegram_id;
  elsif p_action='claim_achievement' then
    mission:='achievement_'||(p_payload->>'id'); select exists(select 1 from mission_claims where player_id=p_telegram_id and period='once' and mission_id=mission) into claimed; if claimed then raise exception 'Achievement already claimed'; end if;
    prog:=case p_payload->>'id' when 'firstSpin' then p.spins when 'winner10' then p.wins when 'spins25' then p.spins when 'level5' then p.level when 'collector' then (select count(*) from inventory where player_id=p_telegram_id and discovered) when 'secret' then (select count(*) from inventory where player_id=p_telegram_id and item_id='secret' and discovered) else -1 end;
    threshold:=case p_payload->>'id' when 'firstSpin' then 1 when 'winner10' then 10 when 'spins25' then 25 when 'level5' then 5 when 'collector' then 3 when 'secret' then 1 else 999999 end; reward_amount:=case p_payload->>'id' when 'firstSpin' then 250 when 'collector' then 750 when 'winner10' then 1000 when 'spins25' then 1500 when 'level5' then 2000 when 'secret' then 5000 else 0 end; if prog<threshold then raise exception 'Achievement is locked'; end if; insert into mission_claims values(p_telegram_id,'once',mission,now()); update players set balance=balance+reward_amount,xp=xp+35 where telegram_id=p_telegram_id;
  elsif p_action='referral_info' then return player_snapshot(p_telegram_id);
  else raise exception 'Unsupported action'; end if;
  perform apply_player_levels(p_telegram_id);
  return player_snapshot(p_telegram_id)||jsonb_build_object('event',jsonb_build_object('action',p_action,'reward',coalesce(reward_amount,0)));
end $$;

create or replace function admin_action(p_admin jsonb, p_action text, p_payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare target bigint; item text; amount bigint; tournament_id uuid;
begin
  insert into admin_audit(admin_id,action,payload) values((p_admin->>'id')::bigint,p_action,p_payload);
  if p_action='overview' then
    return jsonb_build_object('players',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from(select telegram_id,username,display_name,balance,level,spins,wins,blocked,is_owner,last_seen from players order by last_seen desc limit 200)x),'totals',(select jsonb_build_object('players',count(*),'coins',coalesce(sum(balance),0),'spins',coalesce(sum(spins),0)) from players),'promos',(select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc),'[]'::jsonb) from promo_codes p),'tournaments',(select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]'::jsonb) from tournaments t));
  end if;
  target:=(p_payload->>'telegram_id')::bigint;
  if p_action='grant_coins' then amount:=(p_payload->>'amount')::bigint; update players set balance=greatest(0,balance+amount) where telegram_id=target;
  elsif p_action='grant_item' then item:=p_payload->>'item_id'; amount:=greatest(1,coalesce((p_payload->>'count')::int,1)); insert into inventory(player_id,item_id,count) values(target,item,amount) on conflict(player_id,item_id) do update set count=inventory.count+excluded.count,discovered=true;
  elsif p_action='set_blocked' then update players set blocked=coalesce((p_payload->>'blocked')::boolean,false) where telegram_id=target;
  elsif p_action='delete_player' then delete from players where telegram_id=target;
  elsif p_action='delete_promo' then delete from promo_codes where code=upper(trim(p_payload->>'code'));
  elsif p_action='create_promo' then insert into promo_codes(code,reward,max_uses,expires_at) values(upper(trim(p_payload->>'code')),(p_payload->>'reward')::bigint,coalesce((p_payload->>'max_uses')::int,100),(p_payload->>'expires_at')::timestamptz) on conflict(code) do update set reward=excluded.reward,max_uses=excluded.max_uses,expires_at=excluded.expires_at,active=true;
  elsif p_action='set_config' then update game_config set config=config||p_payload,updated_at=now() where id=true;
  elsif p_action='create_tournament' then insert into tournaments(name,starts_at,ends_at,reward_pool) values(p_payload->>'name',coalesce((p_payload->>'starts_at')::timestamptz,now()),(p_payload->>'ends_at')::timestamptz,coalesce((p_payload->>'reward_pool')::bigint,10000)) returning id into tournament_id;
  else raise exception 'Unsupported admin action'; end if;
  return admin_action(p_admin,'overview','{}'::jsonb);
end $$;

insert into tournaments(name,starts_at,ends_at,reward_pool)
select 'Launch Tournament',now(),now()+interval '30 days',50000
where not exists(select 1 from tournaments where active and now() between starts_at and ends_at);

revoke all on function current_week_key() from public, anon, authenticated;
revoke all on function current_season_key() from public, anon, authenticated;
revoke all on function apply_player_levels(bigint) from public, anon, authenticated;
revoke all on function player_snapshot(bigint) from public, anon, authenticated;
revoke all on function bootstrap_player(jsonb,text,boolean) from public, anon, authenticated;
revoke all on function game_action(bigint,text,jsonb,boolean) from public, anon, authenticated;
revoke all on function admin_action(jsonb,text,jsonb) from public, anon, authenticated;

grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
alter default privileges in schema public grant all privileges on tables to service_role;
alter default privileges in schema public grant all privileges on sequences to service_role;

grant execute on function player_snapshot(bigint) to service_role;
grant execute on function bootstrap_player(jsonb,text,boolean) to service_role;
grant execute on function game_action(bigint,text,jsonb,boolean) to service_role;
grant execute on function admin_action(jsonb,text,jsonb) to service_role;
-- Points 32-37: crystals, player market, clans, raids, wars and daily quests
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
