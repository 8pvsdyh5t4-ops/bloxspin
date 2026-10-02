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

alter table star_orders enable row level security;
alter table economy_ledger enable row level security;
grant all privileges on star_orders, economy_ledger to service_role;
grant usage, select on sequence economy_ledger_id_seq to service_role;

do $$
declare
  fn text;
begin
  fn := pg_get_functiondef('game_action(bigint,text,jsonb,boolean)'::regprocedure);
  fn := replace(
    fn,
    'item_value:=case item when ''block'' then 50 when ''sword'' then 150 when ''pet'' then 400 when ''crystal'' then 900 when ''crown'' then 2000 when ''secret'' then 5000 else 0 end;',
    'item_value:=floor((case item when ''block'' then 50 when ''sword'' then 150 when ''pet'' then 400 when ''crystal'' then 900 when ''crown'' then 2000 when ''secret'' then 5000 else 0 end)*0.9);'
  );
  execute fn;
end $$;
